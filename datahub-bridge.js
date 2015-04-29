var Face = require('ndn-js').Face;
var Name = require('ndn-js').Name;
var Data = require('ndn-js').Data;
var Blob = require('ndn-js').Blob;
var UnixTransport = require('ndn-js').UnixTransport;

var DataBuffer = require('./data-buffer.js').DataBuffer;
var requestInsert = require('./basic-insertion.js').requestInsert;

var keyChain = require('./fake-keychain.js').keyChain;
var certificateName = require('./fake-keychain.js').certificateName;

var repoCommandPrefix = new Name('/ndn/edu/ucla/bms/repo');
var repoDataPrefix = new Name('/ndn/edu/ucla/bms/data');

var dataBuffer = new DataBuffer(10);

// Connect to the local forwarder with a Unix socket.
var face = new Face(new UnixTransport());
face.setCommandSigningInfo(keyChain, certificateName);

face.registerPrefix(
    repoDataPrefix,
    function(prefix, interest, transport, registeredPrefixId) {
	var entry = dataBuffer.find(interest.name);
	if (entry != null) {
	    var data = entry.data;
	    var encodedData = data.wireEncode();
	    transport.send(encodedData.buf());
	    console.log("Data retrieved: " + data.name.toUri());
	    dataBuffer.removeAtIndex(entry.index);
	} else {
	    console.log("Cannot find data for " + interest.name.toUri());
	}
    },
    function(prefix) { 
	console.log('Register failed for prefix ' + prefix.toUri());
	tail.unwatch();
	face.close();
    }
);

var Reader = require('./datahub-reader.js').Reader;

var onData = function(obj) {
    // Generate data
    var dataName = new Name(repoDataPrefix)
	.append(obj.name).append(obj.seconds.toString());
    var dataNameWithSegmentZero = new Name(dataName).appendSegment(0);
    var data = new Data(dataNameWithSegmentZero);
    var content = JSON.stringify(obj);
    data.setContent(new Blob(content));
    keyChain.sign(data, certificateName);
    dataBuffer.add(data);

    // Send repo insert command
    requestInsert(
	face, repoCommandPrefix, dataName,
	function() {
	    console.log('Insert started for ' + dataName.toUri());
	},
	function() {
	    console.log('requestInsert failed');
	}, 0, 0);
};

 
var onError =  function() {
    face.close();
};

var reader = new Reader(onData, onError);

