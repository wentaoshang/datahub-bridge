var ProtoBuf = require("protobufjs");
var Face = require('ndn-js').Face;
var Name = require('ndn-js').Name;
var Interest = require('ndn-js').Interest;
var Data = require('ndn-js').Data;
var Blob = require('ndn-js').Blob;
var UnixTransport = require('ndn-js').UnixTransport;
var ProtobufTlv = require('ndn-js').ProtobufTlv;
var KeyType = require('ndn-js').KeyType;
var MemoryIdentityStorage = require('ndn-js').MemoryIdentityStorage;
var MemoryPrivateKeyStorage = require('ndn-js').MemoryPrivateKeyStorage;
var IdentityManager = require('ndn-js').IdentityManager;
var SelfVerifyPolicyManager = require('ndn-js').SelfVerifyPolicyManager;
var KeyChain = require('ndn-js').KeyChain;

/**
 * Send a command interest for the repo to fetch the given fetchName and insert
 * it in the repo.
 * @param {Face} face The Face used to call makeCommandInterest and expressInterest.
 * @param {Name} repoCommandPrefix The repo command prefix.
 * @param {Name} fetchName The name to fetch. If startBlockId and endBlockId are
 * supplied, then the repo will request multiple segments by appending the range
 * of block IDs (segment numbers).
 * @param {function} onInsertStarted When the request insert command
 * successfully returns, this calls onInsertStarted().
 * @param {function} onFailed If the command fails for any reason, this prints
 * an error and calls onFailed().
 * @param {number} startBlockId (optional) The starting block ID (segment
 * number) to fetch.
 * @param {number} endBlockId The end block ID (segment number) to fetch.
 */
function requestInsert
  (face, repoCommandPrefix, fetchName, onInsertStarted, onFailed, startBlockId,
   endBlockId)
{
  var builder = ProtoBuf.loadProtoFile("repo-command-parameter.proto");
  var descriptor = builder.lookup("ndn_message.RepoCommandParameterMessage");
  var RepoCommandParameterMessage = descriptor.build();
  var parameter = new RepoCommandParameterMessage();
  parameter.repo_command_parameter =
    new RepoCommandParameterMessage.RepoCommandParameter();

  // Add the Name.
  parameter.repo_command_parameter.name = new RepoCommandParameterMessage.Name();
  for (var i = 0; i < fetchName.size(); ++i)
    parameter.repo_command_parameter.name.add
      ("component", fetchName.get(i).getValue().buf());
  // Add startBlockId and endBlockId if supplied.
  if (startBlockId != null)
      parameter.repo_command_parameter.start_block_id = startBlockId;
  if (endBlockId != null)
      parameter.repo_command_parameter.end_block_id = endBlockId;

  // Create the command interest.
  var interest = new Interest(new Name(repoCommandPrefix).append("insert")
    .append(new Name.Component(ProtobufTlv.encode(parameter, descriptor))));
  face.makeCommandInterest(interest);

  // Send the command interest and get the response or timeout.
  face.expressInterest
    (interest,
     function(localInterest, data) {
       var builder = ProtoBuf.loadProtoFile("repo-command-response.proto");
       var descriptor = builder.lookup("ndn_message.RepoCommandResponseMessage");
       var RepoCommandResponseMessage = descriptor.build();
       var response = new RepoCommandResponseMessage();
       try {
         ProtobufTlv.decode(response, descriptor, data.getContent());
       } catch (ex) {
         console.log("Cannot decode the repo command response " + ex);
         onFailed();
       }

       if (response.repo_command_response.status_code == 100)
         onInsertStarted();
       else {
         console.log
           ("Got repo command error code " +
            response.repo_command_response.status_code);
          onFailed();
       }
     },
     function(localInterest) {
       console.log("Insert repo command timeout");
       onFailed();
     });
}

exports.requestInsert = requestInsert;

/**
 * This is an example class to supply the data requested by the repo-ng
 * insertion process.  For you application, you would supply data in a different
 * way.  This sends data packets until it has sent (endBlockId - startBlockId) + 1
 * packets.  It might be simpler to finish when onInterest has sent the packet
 * for segment endBlockId, but there is no guarantee that the interests will
 * arrive in order.  Therefore we send packets until the total is sent.
 * @param {KeyChain} keyChain This calls keyChain.sign.
 * @param {Name} certificateName The certificateName for keyChain.sign.
 * @param {number} startBlockId The startBlockId given to requestInsert().
 * @param {number} endBlockId The endBlockId given to requestInsert().
 * @param {function} onFinished When the final segment has been sent, this calls
 * onFinished().
 */
var ProduceSegments = function ProduceSegments
  (keyChain, certificateName, startBlockId, endBlockId, onFinished)
{
  this.keyChain = keyChain;
  this.certificateName = certificateName;
  this.startBlockId = startBlockId;
  this.endBlockId = endBlockId;
  this.nSegmentsSent = 0;
  this.onFinished = onFinished;
};

ProduceSegments.prototype.onInterest = function
  (prefix, interest, transport, registeredPrefixId)
{
  console.log("Got interest " + interest.toUri());

  // Make and sign a Data packet with the interest name.
  var data = new Data(interest.name);
  var content = "Data packet " + interest.name.toUri();
  data.setContent(new Blob(content));
  this.keyChain.sign(data, this.certificateName);
  var encodedData = data.wireEncode();

  transport.send(encodedData.buf());
  console.log("Sent data packet " + data.getName().toUri());

  this.nSegmentsSent += 1;
  if (this.nSegmentsSent >= (this.endBlockId - this.startBlockId) + 1)
    // We sent the final segment.
    this.onFinished();
};

var keyChain = require('./fake-keychain.js').keyChain;
var certificateName = require('./fake-keychain.js').certificateName;

/**
 * Call requestInsert and register a prefix so that ProduceSegments will answer
 * interests from the repo to send the data packets. This assumes that repo-ng
 * is already running (e.g. `sudo ndn-repo-ng`).
 */
function main()
{
  var repoCommandPrefix = new Name("/ndn/edu/ucla/bms/repo");
  var repoDataPrefix = new Name("/ndn/edu/ucla/bms/data");

  var nowMilliseconds = new Date().getTime();
  var fetchPrefix = new Name(repoDataPrefix).append("testinsert").appendVersion
    (nowMilliseconds);

  // Connect to the local forwarder with a Unix socket.
  var face = new Face(new UnixTransport());
  face.setCommandSigningInfo(keyChain, certificateName);

  // Register the prefix and send the repo insert command at the same time.
  var startBlockId = 0;
  var endBlockId = 1;
  var produceSegments = new ProduceSegments
    (keyChain, certificateName, startBlockId, endBlockId,
     function() {
       console.log("All data was inserted.");
      // This will cause the script to quit.
      face.close();
     });
  console.log("Register prefix " + fetchPrefix.toUri());
  face.registerPrefix(
    fetchPrefix, 
    function(prefix, interest, transport, registeredPrefixId) {
      produceSegments.onInterest(prefix, interest, transport, registeredPrefixId);
    },
    function(prefix) { 
      console.log("Register failed for prefix " + prefix.toUri());
      // This will cause the script to quit.
      face.close();
    });

  requestInsert(
    face, repoCommandPrefix, fetchPrefix, 
    function() { console.log("Insert started for " + fetchPrefix.toUri()); },
    function() {
      // Already printed the error. This will cause the script to quit.
      face.close();
    }, startBlockId, endBlockId);
}

//main();
