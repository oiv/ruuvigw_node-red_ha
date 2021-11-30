/*
Ruuvi Gateway to Homeassistant with Node-red
Otto Vainio (oiv@iki.fi)

Gets json from Ruuvi Gateway (https://ruuvi.com/gateway/) using mqtt parsing the message
and sending a proper home-assistant mqtt discovery config message, state and status messages

Tag parsing taken from https://github.com/ojousima/node-red 

Usage:
MQTT-IN node listening to topiv ruuvi/# on your mosquitto broker. If you are running a supervised node-red and
mosquitto + node-red locally then host should be local = 127.0.0.1
from mqtt-node to json node to convert the payload to json
from json to function node with this code
from this function node next is mqtt-out. Topic will be set in msg.topic

*/

/*
Name your tags here. If name not found then a cleaned (: removed) mac is used as tag name
*/
let tags = {
    "AA:BB:CC:DD:EE:FF":"Kitchen",
    "CC:BB:CC:DD:EE:FF":"Livingroom",
    "DD:BB:CC:DD:EE:FF":"Outside"
}


var parseMacFromMqttTopic = function(topic) {
    let macFound = topic.match(/(?:[0-9a-fA-F]:?){12}/g);
    if (!macFound) {
        return "";
    } else {
        return [macFound[0],macFound[1]];
    }
}
var parseMacFromStatusMqttTopic = function(topic) {
    let macFound = topic.match(/(?:[0-9a-fA-F]:?){12}/g);
    if (!macFound) {
        return "";
    } else {
        return macFound[0];
    }
}
var parseMacAddress = function(peripheralUuid) {
    // Places the colon every 2 characters, but not at the end
    return peripheralUuid.replace(/.{2}(?!\b)/g, '$&:');
}

var parseRuuviData = function(manufacturerDataString) {

    let formatStart = 4;
    let formatEnd = 6;
    let formatRawV1 = "03";
    let formatRawV2 = "05";
    let dataFormat = manufacturerDataString.substring(formatStart, formatEnd);
    let dataObject = {};
    switch (dataFormat) {
        case formatRawV1:
            dataObject = parseRawV1Ruuvi(manufacturerDataString)
            break;
        case formatRawV2:
            dataObject = parseRawV2Ruuvi(manufacturerDataString)
            break;

        default:
            //console.log("Unknown dataformat: " + dataFormat);
            dataObject = null;
    }

    return dataObject;
}

//https://github.com/ruuvi/ruuvi-sensor-protocols
var parseRawV1Ruuvi = function(manufacturerDataString) {
    let humidityStart = 6;
    let humidityEnd = 8;
    let temperatureStart = 8;
    let temperatureEnd = 12;
    let pressureStart = 12;
    let pressureEnd = 16;
    let accelerationXStart = 16;
    let accelerationXEnd = 20;
    let accelerationYStart = 20;
    let accelerationYEnd = 24;
    let accelerationZStart = 24;
    let accelerationZEnd = 28;
    let batteryStart = 28;
    let batteryEnd = 32;

    let robject = {};

    let humidity = manufacturerDataString.substring(humidityStart, humidityEnd);
    //console.log(humidity);
    humidity = parseInt(humidity, 16);
    humidity /= 2; //scale
    robject.humidity = humidity;

    let temperatureString = manufacturerDataString.substring(temperatureStart, temperatureEnd);
    let temperature = parseInt(temperatureString.substring(0, 2), 16); //Full degrees
    temperature += parseInt(temperatureString.substring(2, 4), 16) / 100; //Decimals
    if (temperature > 128) { // Ruuvi format, sign bit + value
        temperature = temperature - 128;
        temperature = 0 - temperature;
    }
    robject.temperature = +temperature.toFixed(2); // Round to 2 decimals, format as a number

    let pressure = parseInt(manufacturerDataString.substring(pressureStart, pressureEnd), 16); // uint16_t pascals
    pressure += 50000; //Ruuvi format
    robject.pressure = pressure;

    let accelerationX = parseInt(manufacturerDataString.substring(accelerationXStart, accelerationXEnd), 16); // milli-g
    if (accelerationX > 32767) { accelerationX -= 65536; } //two's complement

    let accelerationY = parseInt(manufacturerDataString.substring(accelerationYStart, accelerationYEnd), 16); // milli-g
    if (accelerationY > 32767) { accelerationY -= 65536; } //two's complement

    let accelerationZ = parseInt(manufacturerDataString.substring(accelerationZStart, accelerationZEnd), 16); // milli-g
    if (accelerationZ > 32767) { accelerationZ -= 65536; } //two's complement

    robject.accelerationX = accelerationX;
    robject.accelerationY = accelerationY;
    robject.accelerationZ = accelerationZ;

    let battery = parseInt(manufacturerDataString.substring(batteryStart, batteryEnd), 16); // milli-g
    robject.battery = battery;

    return robject;
}

var parseRawV2Ruuvi = function(manufacturerDataString) {
    let temperatureStart = 6;
    let temperatureEnd = 10;
    let humidityStart = 10;
    let humidityEnd = 14;
    let pressureStart = 14;
    let pressureEnd = 18;
    let accelerationXStart = 18;
    let accelerationXEnd = 22;
    let accelerationYStart = 22;
    let accelerationYEnd = 26;
    let accelerationZStart = 26;
    let accelerationZEnd = 30;
    let powerInfoStart = 30;
    let powerInfoEnd = 34;
    let movementCounterStart = 34;
    let movementCounterEnd = 36;
    let sequenceCounterStart = 36;
    let sequenceCounterEnd = 40;

    let robject = {};

    let temperatureString = manufacturerDataString.substring(temperatureStart, temperatureEnd);
    let temperature = parseInt(temperatureString, 16);

    if ((temperature & 0x8000) > 0) { temperature = temperature - 0x10000; } // two's complement

    robject.temperature = +(temperature / 200).toFixed(2); // 0.005 degrees

    let humidityString = manufacturerDataString.substring(humidityStart, humidityEnd);
    let humidity = parseInt(humidityString, 16); // 0.0025%
    robject.humidity = +(humidity / 400).toFixed(2);

    let pressure = parseInt(manufacturerDataString.substring(pressureStart, pressureEnd), 16); // uint16_t pascals
    pressure += 50000; //Ruuvi format
    robject.pressure = pressure;

    // acceleration values in milli-Gs
    let accelerationX = parseInt(manufacturerDataString.substring(accelerationXStart, accelerationXEnd), 16); // milli-g
    if ((accelerationX & 0x8000) > 0) { accelerationX -= 0x10000; } // two's complement

    let accelerationY = parseInt(manufacturerDataString.substring(accelerationYStart, accelerationYEnd), 16); // milli-g
    if ((accelerationY & 0x8000) > 0) { accelerationY -= 0x10000; } // two's complement

    let accelerationZ = parseInt(manufacturerDataString.substring(accelerationZStart, accelerationZEnd), 16); // milli-g
    if ((accelerationZ & 0x8000) > 0) { accelerationZ -= 0x10000; } // two's complement

    robject.accelerationX = accelerationX;
    robject.accelerationY = accelerationY;
    robject.accelerationZ = accelerationZ;

    let powerInfoString = manufacturerDataString.substring(powerInfoStart, powerInfoEnd);
    let battery = (parseInt(powerInfoString, 16) >> 5) + 1600; // millivolts > 1600
    let txpower = (parseInt(powerInfoString, 16) & 0x001F) - 40; // dB > -40
    robject.battery = battery;
    robject.txPower = txpower;

    let movementCounterString = manufacturerDataString.substring(movementCounterStart, movementCounterEnd);
    let movementCounter = parseInt(movementCounterString, 16);
    robject.movementCounter = movementCounter;

    let sequenceCounterString = manufacturerDataString.substring(sequenceCounterStart, sequenceCounterEnd);
    let sequenceCounter = parseInt(sequenceCounterString, 16);
    robject.sequenceCounter = sequenceCounter;

    return robject;
}

var sendState = function(tmac,key,data) {
    msg.topic = `ruuvigw/sensor/ruuvitag_${tmac}_${key}/state`
    msg.payload = data;
    node.send(msg);
}

var sendConfig = function(tmac,gmac,tagname,key) {
    const device_class = {
    	temperature: "temperature",
    	humidity: "humidity",
    	pressure: "pressure",
    	accelerationX: "",
    	accelerationY: "",
    	accelerationZ: "",
    	battery: "voltage",
    	txPower: "signal_strength",
    	movementCounter: "",
    	sequenceCounter: "",
    	mac: "",
    	rssi: ""
    };
    const unit_of_measurement = {
    	temperature: "°C",
    	humidity: "%",
    	pressure: "hPa",
    	accelerationX: "G",
    	accelerationY: "G",
    	accelerationZ: "G",
    	battery: "V",
    	txPower: "dBm",
    	movementCounter: "",
    	sequenceCounter: "",
    	mac: "",
    	rssi: ""
    };
    const state_class = {
    	temperature: "measurement",
    	humidity: "measurement",
    	pressure: "measurement",
    	accelerationX: "measurement",
    	accelerationY: "measurement",
    	accelerationZ: "measurement",
    	battery: "measurement",
    	txPower: "measurement",
    	movementCounter: "",
    	sequenceCounter: "",
    	mac: "",
    	rssi: "measurement"
    };
    let topic = `homeassistant/sensor/ruuvitag_${tmac}_${key}/config`
 
// Configuration message
    cmsg = {};
    if (device_class[key]) cmsg.device_class = device_class[key];
    if (unit_of_measurement[key]) cmsg.unit_of_measurement = unit_of_measurement[key];
    if (state_class[key]) cmsg.state_class = state_class[key];
    cmsg.name = `Ruuvitag ${tagname} ${key}`;
    cmsg.state_topic = `ruuvigw/sensor/ruuvitag_${tmac}_${key}/state`;
    cmsg.availability_topic = `ruuvigw/${gmac}/status`;
    cmsg.unique_id = `ruuvitag_${tmac}_${key}`

// device
    dmsg = {};
    dmsg.identifiers = gmac;
    dmsg.name = "RuuviGW";
    dmsg.manufacturer = "Ruuvi";
    dmsg.model = "RuuviGateway";
    cmsg.device=dmsg;
	
// Sendit
    msg.payload = JSON.stringify(cmsg);
    msg.topic=topic;
    node.send(msg);
	

}

/*
Do the thing

ruuvi/AA:BB:CC:DD:EE:FF/<SENSOR_MAC_ADDRESS>/GG:HH:II:JJ:KK:LL {
        "gw_mac":       "AA:BB:CC:DD:EE:FF",
        "rssi": -71,
        "aoa":  [],
        "gwts": "1638131887",
        "ts":   "1638131886",
        "data": "0201061BFF9904050E0030BFC2DCFEAC03B4FFDCA1B6965F41D9CDCA5A5182",
        "coords":       ""
}
ruuvi/AA:BB:CC:DD:EE:FF/<SENSOR_MAC_ADDRESS>/gw_status {"state": "online"}


*/


// Send status message based on Ruuvi Gateway status. Current Gateway firmware does not seem to send last will
// so no offline message receved, Maybe later
if (msg.topic.endsWith("gq_status")) {
    let gwmac=parseMacFromStatusMqttTopic(msg.topic);
    let amsg = {};
    amsg.topic = `ruuvigw/${gwmac}/status`;
    amsg.payload = msg.payload.state;
    node.send(amsg);
    return null;
}

// Start extracting message
isMqtt = true;
let mqttManufacturerStringStart = 10;
manufacturerDataString = msg.payload.data.substring(mqttManufacturerStringStart);

let manufacturerIdStart = 0;
let manufacturerIdEnd = 4;

// Ruuvi manufacturer ID is 0x0499 but is little endian for some reason
let ruuviTagId = "9904";

// Ignore any non-Ruuvi tags
if (manufacturerDataString.substring(manufacturerIdStart, manufacturerIdEnd) != ruuviTagId) {
    return null;
}
let ruuviData = parseRuuviData(manufacturerDataString);
if (!ruuviData) {
    return null;
}

//Get mac and tagname
let bmac = parseMacFromMqttTopic(msg.topic);
let gwmac = bmac[0];
let tagmac = bmac[1];

ruuviData.mac = tagmac;
ruuviData.rssi = msg.payload.rssi;

// Remove semicolons from mac
let re = /:/gi;
var regmac = tagmac.replace(re,"");
var tagname = regmac;

// Use tagname is set
if (tags[tagmac]) tagname = tags[tagmac];

//  Check if config message is already sent.
//  Resend every 10 minutes
var init = 0; //context.get(regmac)|1;
var lastmsg = context.get("LM"+regmac)|1;
var lastconf = context.get("lastconf")|1;
let ms = Date.now()/1000;

if (lastconf+(60*10)<ms){
    init=1;
    context.set("lastconf",ms);
}

/*
This is basically what we have after we have parsed the whole message
}
"payload": {
	"temperature": 16.51,
	"humidity": 37.9,
	"pressure": 98316,
	"accelerationX": -340,
	"accelerationY": 952,
	"accelerationZ": -36,
	"battery": 2881,
	"txPower": -18,
	"movementCounter": 150,
	"sequenceCounter": 1862,
	"mac": "GG:HH:II:JJ:KK:LL",
	"rssi": -65
}
*/
// If init for this tag then send config. Should we send it regularly? 
if (init===1) {
    for(var k in ruuviData) {
        sendConfig(regmac,gwmac,tagname,k);
    }
    let amsg = {};
    amsg.topic = `ruuvigw/${gwmac}/status`;
    amsg.payload = "online";
    node.send(amsg);
}

// Send state messages. Should we use combined message instead?
// Rate limit the mesages to 1/minute
if (lastmsg+60<ms) {
    context.set("LM"+regmac,ms);
    for(var l in ruuviData) {
        sendState(regmac,l,ruuviData[l]);
    }
}


// Store tag mac to context so we do not resend.

msg.init=init;
msg.payload = JSON.stringify(ruuviData);
context.set(regmac,2);
return null;
