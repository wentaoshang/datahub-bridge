var Tail = require('tail').Tail;

var Reader = function Reader(dataHandler, errorHandler)
{
    this.tail = new Tail('/home/remap/ucla-datahub.log');
    this.onData = dataHandler;
    this.onError = errorHandler;

    var marker = 'Process message (point ';
    var self = this;

    this.tail.on('line', function(data) {
	var i = data.indexOf(marker);
	if (i !== -1) {
	    var str = data.substring(i + marker.length, data.length - 1);
	    var arr = str.split(' ');
	    if (arr.length == 10) {
		var obj = {
		    name: arr[0],
		    type: Number(arr[1]),
		    value: Number(arr[2]),
		    conf: Number(arr[3]),
		    sec: Number(arr[4]),
		    locked: Number(arr[5]),
		    seconds: Number(arr[6]),
		    nanoseconds: Number(arr[7]),
		    flags: Number(arr[8]),
		    quality: Number(arr[9]),
		};
		//console.log(obj);
		self.onData(obj);
	    }
	}
    });
 
    this.tail.on('error', function(error) {
	console.log('ERROR: ', error);
	self.onError();
    });
};

exports.Reader = Reader;
