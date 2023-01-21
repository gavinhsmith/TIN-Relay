/** 
 * @typedef {{name: string, type: string, required: boolean}} Param A command paramater 
 * @typedef {{name: string, status: number, data: string[]}} CommandResponse A command response 
 * @typedef {(name: string, callback: (response: CommandResponse) => void, tool: any, params: any[]) => {data: string[], status: number}} CommandHandler A command handler 
 * @typedef {(data: any[]) => void} HookCallback Data sent to a hook
 */

///  COMMAND/HOOK BASES  ///

/** The paramaters a command has */
class CommandParamaters {
    /** @param  {...Param} params Each paramater to add to a command */
    constructor(...params) {
        this.params = params;
    }

    /**
     * Gets a paramater string
     * @returns A stringified version of the paramaters stored.
     */
    toSting() {
        let array = [];

        for (let param of this.params) {
            // Required paramaters have a < > around them and optional ones have an [ ]
            array.push((param.required ? ["<",param.name,": ",param.type,">"] : ["[",param.name,": ",param.type,"]"]).join(""));
        }

        return array.join(" ");
    }
}
/** A processable command */
class Command {
    /**
     * Generate a command response
     * @param {string} name Command name
     * @param {number} status Command exit code
     * @param {string[]} data Command reponse data
     * @returns {CommandResponse} A command response
     */
    static genResponse(name, status, data) {
        return {
            name: name,
            status: status,
            data: data
        };
    }

    static ERR_NOCMD = this.genResponse(null, 1, ["Error: No Command"]);

    /**
     * @param {string[]} name The string name or names of the command (first is the primary name)
     * @param {CommandHandler} handler The command handeler function 
     * @param {CommandParamaters} layout The command paramaters
     */
    constructor(name, handler, params = new CommandParamaters()) {
        this.name = name;
        this.handler = handler;
        this.params = params;
    }

    /**
     * Process the command
     * @param {any} tool Topside variable to pass to handler
     * @param {any[]} params Paramaters to pass to the handler
     * @param {(response: CommandResponse) => void} callback The callback to utilize the response 
     */
    process(tool, params, callback) {
        this.handler(this.name[0], callback, tool, params);
    }

    /**
     * Get the command specification (e.x. help <command>)
     * @returns A string that shows how a command is used
     */
    toString() {
        return [this.name.join("/"), this.params.toSting()].join(" ");
    }
}
/** Manages registering, running, and deregistering commands */
class CommandManager {
    /**
     * The registered command list
     * @type {{[key: string]: Command}}
     */
    static COMMANDS = {};

    /**
     * The listener hook list
     * @type {{hook: string, callback: HookCallback}[]}
     */
    static HOOKS = [];

    /**
     * Gets the command of the manager
     * @param {string} name String name of command 
     * @returns The command instance
     */
    static getCommand(name) {
        for (let nm of Object.keys(this.COMMANDS)) {
            if (this.COMMANDS[nm].name.includes(name)) {
                return this.COMMANDS[nm];
            }
        }
        return undefined;
    }

    /**
     * Registers a new command
     * @param {Command} command The instance of the command to register 
     * @returns The now-registerd command
     */
    static registerCommand(command) {
        this.COMMANDS[command.name[0]] = command;
        return this.COMMANDS[command.name[0]];
    }

    /**
     * Get a list of command names 
     * @param {boolean} primary_only Should this list only include the primary names
     * @returns Array of names
     */
    static getNames(primary_only = false) {
        if (primary_only) return Object.keys(this.COMMANDS);
        let names = [];
        for (let cmd of Object.keys(this.COMMANDS)) names = [...names, ...this.getCommand(cmd).name]
        return names;
    }

    /**
     * Process a user-sent line
     * @param {*} tool Topside variable to pass to handler
     * @param {string} line Text from the user-sent line 
     * @param {(response: CommandResponse) => void} callback The callback to utilize the response 
     */
    static process(line, tool, callback) {
        let cmd = line.split(" ")[0]; // Get command name
        let params = line.split(" ").slice(1); // Get command params
        if (!this.getNames().includes(cmd)) {
            callback(Command.ERR_NOCMD);
        } else {
            this.getCommand(cmd).process(tool, params, callback);
        }
    }

    /**
     * 
     * @param {string} event Name of hook to latch on to
     * @param {HookCallback} callback Function to run on event
     */
    static onEvent(event, callback) {
        this.HOOKS.push({
            hook: event,
            callback: callback
        });
    }

    /**
     * Fires a hook and all functions listening to it
     * @param {string} name Name of hook to fire
     * @param {any[]} data Data to pass to the functions
     */
    static fireHook(name, data) {
        for (let hook of this.HOOKS) {
            if (hook.hook === name) hook.callback(data);
        }
    }
}

///  COMMANDS  ///

/** Help on all commands in the system */
class HelpCommand extends Command {
    constructor() {
        super(["help","h"], function (name, callback, tool, args) {
            let res = [];

            if (args[0] != null && args[0] != undefined) {
                res.push(`Usage for ${args[0]}: ${CommandManager.getCommand(args[0]).toString()}`);
            } else {
                for (let name of CommandManager.getNames(true)) {
                    res.push(`- Usage for ${name}: ${CommandManager.getCommand(name).toString()}`);
                }
            }

            callback({
                name: name,
                status: 0,
                data: res
            });
        }, new CommandParamaters({
            name: "command",
            type: "string",
            required: false
        }))
    }
}
/** Exit the application */
class QuitCommand extends Command {
    constructor() {
        super(["quit","q","exit"], function (tool) {
            process.exit(0);
        })
    }
}
/** Set the serial device */
class SerialSetCommand extends Command {
    constructor() {
        super(["set"], function (name, callback, {config, SerialPort}, args) {
            config.device = args[0];
            config.init = true;
            config.port = new SerialPort({
                path: args[0], baudRate: 9600, autoOpen: false
            });
            CommandManager.fireHook("set", args);
            callback({
                name: name,
                status: 0,
                data: [`Set serial device to [${args[0]}]`]
            });
        }, new CommandParamaters({
            name: "device",
            type: "string",
            required: true
        }))
    }
}
/** Close serial connection */
class SerialCloseCommand extends Command {
    constructor() {
        super(["close", "stop"], function (name, callback, {config}) {
            if (config.init === false || config.ready === false) {
                callback({
                    name: name,
                    status: 2,
                    data: ["Already closed!"]
                });
            } else {
                config.ready = false;
                config.init = false;
                config.port.close();
                CommandManager.fireHook("close", []);
                callback({
                    name: name,
                    status: 0,
                    data: [`Closed serial device connection to [${config.device}]. Please run set and start again!`]
                });
            }
        })
    }
}
/** Open serial connection */
class SerialOpenCommand extends Command {
    constructor() {
        super(["open", "start"], function (name, callback, {config}, args) {
            if (config.init === false) {
                callback({
                    name: name,
                    status: 2,
                    data: ["No serial device set!"]
                });
            } else if (config.ready === true) {
                callback({
                    name: name,
                    status: 2,
                    data: ["Already started!"]
                });
            } else {
                config.port.open(function (err) {
                    if (err) {
                        callback({
                            name: name,
                            status: 1,
                            data: ["Error on connection!", err.message]
                        });
                    } else {
                        config.ready = true;
                        CommandManager.fireHook("open", args);
                        callback({
                            name: name,
                            status: 0,
                            data: [`Connection to [${config.device}] opened!`]
                        });
                    }
                });
                config.port.on("error", function (err) {
                    CommandManager.fireHook("error", [err.message]);
                });
                config.port.on("data", function (data) {
                    CommandManager.fireHook("read", [data]);
                });
            }
        })
    }
}
/** Write to the serial port */
class SerialWriteCommand extends Command {
    constructor() {
        super(["write", "w", "send"], function (name, callback, {config}, args) {
            if (config.init === false || config.ready === false) {
                callback({
                    name: name,
                    status: 2,
                    data: ["Not ready!"]
                });
            } else {
                let msg = args.join(" ");
                config.port.write(msg, function (err) {
                    if (err) {
                        callback({
                            name: name,
                            status: 1,
                            data: ["Error on send!", err.message]
                        });
                    } else {
                        CommandManager.fireHook("write", msg);
                        callback({
                            name: name,
                            status: 0,
                            data: [`Message [${msg}] sent!`]
                        });
                    }
                })
            }
        }, new CommandParamaters({
            name: "message",
            type: "string",
            required: true
        }))
    }
}

CommandManager.registerCommand(new HelpCommand());
CommandManager.registerCommand(new QuitCommand());

CommandManager.registerCommand(new SerialSetCommand());
CommandManager.registerCommand(new SerialCloseCommand());
CommandManager.registerCommand(new SerialOpenCommand());
CommandManager.registerCommand(new SerialWriteCommand());

///  EXPORT  ///

module.exports = CommandManager;