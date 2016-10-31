var fs = require("fs")
var _ = require('lodash')
var moment = require('moment-timezone')
var request = require('request')
var xml2json = require('xml2json')

var transitStops = require('./transit_stops.json')

var route = function route(origin, destination, time, forArrival, numberOfResults, callback) {
    var body = createBody(origin, destination, time, forArrival, numberOfResults)

    var options = {
        method: 'POST',
        url: 'http://trias.vvo-online.de:9000/Middleware/Data/Trias',
        body: body,
        headers: {
            'Cookie': "cookie",
            'Content-Type': 'application/xml',
            'Content-Length': Buffer.byteLength(body)
        }
    }

    function createResponse(error, response, body) {
        var output
        if (!error && response.statusCode == 200) {
            var json = xml2json.toJson(body)
            json = JSON.parse(json)
            var outputJson = processResponseJson(json)

            output = {
                'info': response.statusCode,
                'result': outputJson
            }
        }

        callback(output)
    }
    request(options, createResponse)
}

function processResponseJson(json) {
    var responseArray = []
    var hasInterchanges = false

    var tripResults = json['Trias']['ServiceDelivery']['DeliveryPayload']['TripResponse']['TripResult']

    var tripResultsIsArray = tripResults instanceof Array
    if (!tripResultsIsArray) {
        tripResults = [tripResults]
    }

    for (var i = 0; i < tripResults.length; i++) {
        var startPoint, stopPoint, line, lineDirection
        var interchanges = []

        var tripResult = tripResults[i]

        var duration = tripResult["Trip"]["Duration"].replace(/\D/g, '')
        var startTime = new Date(tripResult["Trip"]["StartTime"])
        var endTime = new Date(tripResult["Trip"]["EndTime"])

        var tripLeg = tripResult["Trip"]["TripLeg"]

        hasInterchanges = tripLeg instanceof Array

        if (hasInterchanges) {
            var lastIndex = tripLeg.length - 1
            startPoint = tripLeg[0]["TimedLeg"]["LegBoard"]["StopPointName"]["Text"]
            stopPoint = tripLeg[lastIndex]["TimedLeg"]["LegAlight"]["StopPointName"]["Text"]

            for (var j = 0; j < tripLeg.length; j++) {
                var timedLeg = tripLeg[j]["TimedLeg"]
                if (timedLeg == undefined) {
                  continue
                }

                var sTime = new Date(timedLeg["LegBoard"]["ServiceDeparture"]["TimetabledTime"])
                var eTime = new Date(timedLeg["LegAlight"]["ServiceArrival"]["TimetabledTime"])

                var sPoint = timedLeg["LegBoard"]["StopPointName"]["Text"]
                var ePoint = timedLeg["LegAlight"]["StopPointName"]["Text"]

                if (sPoint != ePoint) {
                    var ptMode = timedLeg["Service"]["Mode"]["PtMode"]
                    var vehicleType = timedLeg["Service"]["Mode"]["Name"]["Text"]

                    var iLine
                    var iLineDirection

                    if (ptMode != 'unknown') {
                        iLine = timedLeg["Service"]["PublishedLineName"]["Text"]
                        iLineDirection = timedLeg["Service"]["DestinationText"]["Text"].replace(/"/g, '')

                        // For example if the API says you should walk.
                    } else {
                        iLine = undefined
                        iLineDirection = undefined
                    }

                    var interchange = {
                        startPoint: sPoint,
                        startTime: sTime,
                        endPoint: ePoint,
                        endTime: eTime,
                        line: iLine,
                        lineDirection: iLineDirection,
                        vehicleType: vehicleType
                    }

                    interchanges.push(interchange)
                }
            }

        } else {
            var timedLeg = tripLeg["TimedLeg"]
            var continousLeg = tripLeg["ContinuousLeg"]
            var sVehicleType

            // If API gives you normal route.
            if (timedLeg != undefined) {
                sVehicleType = timedLeg["Service"]["Mode"]["Name"]["Text"]
                startPoint = timedLeg["LegBoard"]["StopPointName"]["Text"]
                stopPoint = timedLeg["LegAlight"]["StopPointName"]["Text"]
                line = timedLeg["Service"]["PublishedLineName"]["Text"]
                lineDirection = timedLeg["Service"]["DestinationText"]["Text"].replace(/"/g, '')

                // If API says you should walk.
            } else if (continousLeg != undefined) {
                startPoint = continousLeg["LegStart"]["LocationName"]["Text"]
                stopPoint = continousLeg["LegEnd"]["LocationName"]["Text"]
                sVehicleType = continousLeg["Service"]["ContinuousMode"]
            }
        }

        var newJson = {
            resultNr: i,
            startPoint: startPoint,
            stopPoint: stopPoint,
            line: line,
            lineDirection: lineDirection,
            startTime: startTime,
            stopTime: endTime,
            duration: duration,
            hasInterchanges: hasInterchanges,
            interchanges: interchanges,
            vehicleType: sVehicleType
        }

        responseArray.push(newJson)
    }
    return responseArray
}

function createBody(origin, destination, time, forArrival, numberOfResults) {
    var xml = fs.readFileSync(__dirname + '/xml/route.xml').toString()

    if (origin != undefined) {
        origin = origin.toLowerCase()
        var index = _.findIndex(transitStops, {
            "name": origin
        })
        if (index != -1) {
            origin = transitStops[index].nr
        } else {
            console.log('Konnte Starthaltestelle nicht finden.')
        }
    }

    if (destination != undefined) {
        destination = destination.toLowerCase()
        var index = _.findIndex(transitStops, {
            "name": destination
        })
        if (index != -1) {
            destination = transitStops[index].nr
        } else {
            console.log('Konnte Endhaltestelle nicht finden.')
        }
    }

    var request_xml = xml.replace('[[destination]]', destination)
    request_xml = request_xml.replace('[[origin]]', origin)

    if (time == undefined) {
        time = moment(time)
        time = time.tz("Europe/Berlin")
    }

    var format_time = time.format('YYYY-MM-DDTHH:mm:ss')

    if (forArrival === true) {
        request_xml = request_xml.replace('[[destination_time]]', "<DepArrTime>" + format_time + "</DepArrTime>")
        request_xml = request_xml.replace('[[origin_time]]', '')
    } else {
        request_xml = request_xml.replace('[[origin_time]]', "<DepArrTime>" + format_time + "</DepArrTime>")
        request_xml = request_xml.replace('[[destination_time]]', '')
    }

    request_xml = request_xml.replace('[[result_number]]', numberOfResults)

    return request_xml
}

module.exports = route
