// DDM Data
const IOTANode = 'http://node05.iotatoken.nl:16265';// IOTA Node (https://github.com/iotaledger/iri/)
const rpchub = 'localhost:50051';// rpchub (https://github.com/iotaledger/rpchub/)
const flashSeed = 'POLUYZLOHULUXCKSZYENYILPHLSONCQNADFYXDUWFXZUHPEWQGKKXKENCEFFHOGJWGYEEAYWFEAYFB9E9';// Flash Channel Seed (https://github.com/iotaledger/iota.flash.js/)

// DDM Dependencies
const IOTA = require("iota.lib.js");
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
    prompt = require('prompt');

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
    app.post('/devices/:name/stream',(req,res)=>{
        console.log(data)
        console.log(req.params.name);
        res.send(req.body);
    });
}

function main() {
    var iota = new IOTA({ provider: IOTANode });
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

function menu(){
    console.log("Menu");
    var options = {
        "Get Node Info":console.log,
        "Device's list":listDevices,
        "Add Device":addDevice,
        "Subscriptions's list":console.log,
        "Add device":console.log,
        "Subscribe to device":console.log,
        "Close DDM": process.exit
    };
    Object.keys(options).forEach((option,n)=>{
        console.log(`${n}. ${option}`);
    });
    prompt.get(['menu'], function (err, result) {
        Object.values(options)[result.menu]();
    });
}

function listDevices() {
    console.log("Device List:");
    console.log(data.devices);
    menu();
}

function addDevice() {
    console.log("Enter sensor data:")
    prompt.get(['name','description','IAC','category','price','deviceFrequency','structure','sensors'], function (err, result) {
        console.log(result);
        menu();
    });
    //menu();
}

main();
