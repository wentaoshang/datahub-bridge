var DataBuffer = function DataBuffer(capacity) {
    this.capacity = capacity;
    this.size = 0;
    this.store = [];
};

DataBuffer.prototype.add = function (data) {
    if (this.size == this.capacity)
	this.store = this.store.splice(0, 1);

    this.store.push(data);
    ++this.size;
};

DataBuffer.prototype.find = function (name) {
    for (var i = 0; i < this.store.length; i++) {
	if (this.store[i].name.equals(name)) {
	    return {index: i, data: this.store[i]};
	}
    }
    return null;
};

DataBuffer.prototype.removeAtIndex = function (index) {
    if (index >= this.store.length)
	return;

    this.store.splice(index, 1);
    --this.size;
};

exports.DataBuffer = DataBuffer;
