var dvb = require('./index')
var rp = require('request-promise')

dvb.route('Hauptbahnhof', 'Schillerplatz', undefined, false, 5, function(callback) {
  console.log(callback)
})
