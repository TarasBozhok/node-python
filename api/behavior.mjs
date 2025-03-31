export default function(data, connector, config) {
    return new Promise(function (resolve, reject) {
        connector.emit('transmitData', data, resolve);
    });
}
