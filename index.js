const { SerialPort } = require('serialport');
const myRL = require('serverline');

const CommandManager = require("./commands");

myRL.init();
myRL.setCompletion(CommandManager.getNames());

myRL.setPrompt('> ');

const config = {
    init: false,
    ready: false,
    device: "",
    port: new SerialPort({path: "COM1", baudRate: 0, autoOpen: false})
}

function print(array) {
    for (let ln of array) console.info("  "+ln);
}

CommandManager.onEvent("read", function (data) {
    print(["Data Recieved!", ...data]);
})

myRL.on("line", line => {
    CommandManager.process(line, {
        SerialPort, config
    }, function (res) {
        print(res.data);
    });
})

myRL.on('SIGINT', function(rl) {
    rl.question('Confirm exit: ', (answer) => answer.match(/^y(es)?$/i) ? process.exit(0) : rl.output.write('\x1B[1K> '))
});