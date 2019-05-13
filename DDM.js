// DDM Data
const IOTANode = 'http://node05.iotatoken.nl:16265';// IOTA Node (https://github.com/iotaledger/iri/)
const rpchub = 'localhost:50051';// rpchub (https://github.com/iotaledger/rpchub/)
const flashSeed = 'POLUYZLOHULUXCKSZYENYILPHLSONCQNADFYXDUWFXZUHPEWQGKKXKENCEFFHOGJWGYEEAYWFEAYFB9E9';// Flash Channel Seed (https://github.com/iotaledger/iota.flash.js/)

// DDM Dependencies
const transfer = require("./lib/transfer");
const multisig = require("./lib/multisig");
const Helpers = require("./functions");
const Mam = require('mam.client.js')
var grpc = require('grpc');
var protoLoader = require('@grpc/proto-loader');
const express = require('express'),
    app = express(),
    path = require('path'),
    bodyParser = require('body-parser'),
    pug = require('pug'),
    util = require('util'),
    https = require('https'),
    fs = require('fs'),
    prompt = require('prompt'),
    iotaAreaCodes = require('@iota/area-codes'),
    { composeAPI } = require('@iota/core'),
    { asciiToTrytes } = require('@iota/converter');

// Functions
function loadRpchub(){//return gRPC hub client
    var packageDefinition = protoLoader.loadSync('./proto/hub.proto');
    var hub_proto = grpc.loadPackageDefinition(packageDefinition).hub.rpc;
    return new hub_proto.Hub('192.168.0.40:50051',grpc.credentials.createInsecure());
}

function loadWallet(client){
    client.getBalance({userId: "DDM"}, function(err, response) {
        if(err)
            return initHubWallet(client);
        //console.log("Main Wallet Balance: ",typeof response.available == 'undefined' ? 0 : parseInt(response.available),"i");
    });
}

function initHubWallet(client) {
    client.createUser({userId: "DDM"}, function(err, response) {
        if(err)
            return console.error("Error creating wallet DDM wallet",err);
        //console.log("Main Wallet created successfully");
    });
}

function loadData() {
    try {
        var data = require('./DDM.db.json');
        data.paymentMethod.flashChannel = {
            "security": 2,
            "partial_digests": [{
                "digest": "DIGEST",
                "index": 0
            }],
            "tree_depth": 3,
            "balance": 2000
        };
        data.paymentMethod.standard = "IWDIMQIWDQWUROIQWJDSAKMCDSOVJSDGJAGJKFHWPIUGHWEGFNEFBJKLHSIUGRIGNELVNRKDJFHSWOAJDSASIDJASK";
        return data;
    } catch(e) {
        console.error("Error loading DDM.db.json",e);
    }
}

function createWallet(id, client) {//TODO: Current DDM only uses MAM. Need implement "protocol" distinction because not ever will be only MAM
    client.createUser({userId: id}, function(err, response) {
        if(err)
            return console.error("Error creating MAM wallet");
        console.log("MAM Wallet created for channel ",id);
    });
}

function loadSubscriptions(client) {
    data.subscriptions.forEach(function(subscription) {
        switch(subscription.type) {
            case "MAM":
                console.log(subscription.channelRoot);
            break;

            default:
            break;
        }
    });
}

function loadGrcpDDMServer(){
    function getDDMInfo(call, callback) {
        //call.request.name
        callback(null,{
            name: data.name,
            protocols: data.protocols,
            paymentMethod: data.paymentMethod,
            devices: data.devices
        });
    }
    var packageDefinition = protoLoader.loadSync('./proto/DDM.proto');
    var DDM_proto = grpc.loadPackageDefinition(packageDefinition).DDM;
    var server = new grpc.Server();
    server.addService(DDM_proto.DDM.service, {getDDMInfo});
    server.bind('0.0.0.0:50051', grpc.ServerCredentials.createInsecure());
    server.start();

    //uuid: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

function loadHttpListener() {
    app.use(require('helmet')());
    app.use(express.static(path.join(__dirname, './static')));
    app.listen(80, 'localhost');
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(bodyParser.json());
    app.post('/devices/:name/stream',function(req,res) {
        console.log(data)
        console.log(req.params.name);
        res.send(req.body);
    });
}

function main() {
    iota = new composeAPI({ provider: IOTANode });
    var client = loadRpchub();
    data = loadData();
    loadWallet(client);
    loadSubscriptions(client);
    loadGrcpDDMServer();
    loadHttpListener();
    prompt.start();
    console.log("////////////////////////////////////////////");
    console.log("// Decentralised Data Marketplace Demo :) //");
    console.log("////////////////////////////////////////////");
    menu();
}

function saveDB() {
    fs.writeFile('DDM.db.json', JSON.stringify(data), 'utf8', function(err) {
        if(err) console.error("Error saving DB",err);
    });
}

function advertiseDevice(device,id) {
    if(typeof device == "undefined") {
        return prompt.get({
            properties: {
              deviceId: {
                message: 'Invalid device ID',
                required: true,
                conform: function (value) {
                    return typeof data.devices[parseInt(value)] != 'undefined'
                }
              }
          }
        }, function (err, input) {
            advertiseDevice(data.devices[parseInt(input.deviceId)],parseInt(input.deviceId));
        });
    }
    console.log("Advertising device");
    var IACs = getOuterIACs(device.IAC);
    var message = asciiToTrytes(JSON.stringify(getDeviceInfo(device,"advertising")));
    var transfers = IACs.map(function(tag) {
        return {
            tag,
            message,
            address: "TESTING9999999999999999999999999999999999999999999999999999999999999999999999999C",
            value: 0
        };
    });
    
    iota.prepareTransfers("999999999999999999999999999999999999999999999999999999999999999999999999999999999",transfers)
    .then(function(trytes) {
        data.devices[id].advertisementBundle = trytes;
        saveDB();
        return iota.sendTrytes(trytes, 3, 14)
    })

    .then(function(transactionObjects) {
        data.devices[id].advertisementHash = transactionObjects[0].bundle;
        console.log("Advertised device: "+transactionObjects[0].bundle)
        saveDB();
        menu();
    })

    .catch(console.log)
}

function getDeviceInfo(device,scope) {
    switch(scope) {
        case "advertising":
            return {
                name:device.name,
                description:device.description,
                IAC:device.IAC,
                category:device.category,
                price:device.price,
                deviceFrequency:device.deviceFrequency,
                structure:device.structure,
                sensors:device.sensors
            }
        break;
        case "listDevicesFn":
        return {
            name:device.name,
            description:device.description,
            IAC:device.IAC,
            category:device.category,
            price:device.price,
            deviceFrequency:device.deviceFrequency,
            structure:device.structure,
            sensors:device.sensors,
            advertisementHash:device.advertisementHash
        }
        break;
        default:
            return device;
        break;
    }
}

// Returns outer IACs (includes the original IAC)
function getOuterIACs(IAC) {
    var IACs = [IAC];
    var error = false;
    do{
        try {
            IACs.push(iotaAreaCodes.decreasePrecision(IACs.slice(-1)[0]));
        }catch(e) {
            error = e;
        }
    }while(!error);
    return IACs;
}

function getNodeInfo() {
    iota.getNodeInfo()
    .then(info => { 
        console.log(info);
        menu();
     })
    .catch(error => {
        console.error(`Request error: ${error.message}`)
    })
}

function menu(){
    console.log("Menu");
    var options = {
        "Get Node Info":getNodeInfo,
        "Device's list":listDevices,
        "Add Device":addDevice,
        "Advertise Device": advertiseDevice,
        //"Convert lat,lon to IAC code": convertLL2IAC,
        "Subscriptions's list":console.log,
        "Subscribe to device":console.log,
        "Find devices with IAC":console.log,
        "Close DDM": process.exit
    };
    Object.keys(options).forEach(function(option,n) {
        console.log(`${n}. ${option}`);
    });
    prompt.get(['menu'], function (err, result) {
        Object.values(options)[result.menu]();
    });
}

function listDevices() {
    console.log("Device List:");
    data.devices.forEach(device => {
        console.log(getDeviceInfo(device,"listDevicesFn"))
    });
    menu();
}

function addDevice() {
    var schema = {
        properties: {
            IAC: {
                description: 'IOTA IAC Code',
                message: 'Invalid IAC code',
                required: true,
                conform: function (value) {
                    return iotaAreaCodes.isValid(value);
                }
            },
            name: {
                description: "*Device Name",
                required: true
            },
            description: {
                description: "Device Description",
            },
            category: {
                description: "Sensors Category",
            },
            price: {
                required: true,
                description: "*Stream Price (i)"
            },
            deviceFrequency: {
                description: "Frequency Data Stream (kHz)"
            },
            structure: {
                required: true,
                description: "*Device Output Structure"
            },
            sensors: {
                description: "Device's Sensors Quantity",
            }
        }
    };      
    console.log("Add new device:")
    prompt.get(schema, function (err, device) {
        var id = data.devices.push(device)-1;
        saveDB();
        console.log(`Device ${id} added! Want to advertise it? (y=Yes , n=No)`);
        
        prompt.get({
            properties: {
              answer: {
                message: 'Invalid answer (y=Yes , n=No)',
                required: true,
                conform: function (value) {
                    return value == "y" || value == "n";
                }
              }
          }
        }, function (err, answer) {
            if(answer == "y") advertiseDevice(device,id);
            else menu();
        });

    });
}
main();