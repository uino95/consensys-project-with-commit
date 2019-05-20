var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
const ngrok = require('ngrok')
const bodyParser = require('body-parser')

const {
  isDevEnv,
  myhealth_port,
  callback_endpoint
} = require('../poc_config/config.js')

var ejs = require('ejs')

var open = require('open');

app.use(express.static(__dirname + 'views'));

// const uport = require('../lib/index.js')
import {
  Credentials
} from 'uport-credentials'
const helper = require('../itut/helper.js')

const decodeJWT = require('did-jwt').decodeJWT
const transports = require('uport-transports').transport
const message = require('uport-transports').message.util

console.log('loading server...')

const Time30Days = () => Math.floor(new Date().getTime() / 1000) + 1 * 24 * 60 * 60
const Time360Days = () => Math.floor(new Date().getTime() / 1000) + 1 * 24 * 60 * 60 * 12
let endpoint = callback_endpoint + ':' + myhealth_port

const messageLogger = (message, title) => {
  const wrapTitle = title ? ` \n ${title} \n ${'-'.repeat(60)}` : ''
  const wrapMessage = `\n ${'-'.repeat(60)} ${wrapTitle} \n`
  console.log(wrapMessage)
  console.log(message)
}

app.use(bodyParser.json({
  type: '*/*'
}))

//Setting up EJS view Engine and where to get the views from
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(express.static('views'))

const credentials = new Credentials({
  did: 'did:ethr:0xbc3ae59bc76f894822622cdef7a2018dbe353840',
  privateKey: '74894f8853f90e6e3d6dfdd343eb0eb70cca06e552ed8af80adadcc573b35da3'
})

/**
 *  First creates a disclosure request to get the DID (id) of a user. Also request push notification permission so
 *  a push can be sent as soon as a response from this request is received. The DID is used to create the attestation
 *  below. And a pushToken is used to push that attestation to a user.
 */

var currentConnections = {};

app.get('/', (req, res) => {
  res.render('home', {})
})

app.get('/retrievevc', (req, res) => {
  let credentialSubject = {
    "@context": "https://schema.org",
    "@type": "DiagnosticProcedure",
    "name": "X-Ray Scan Result",
    "bodyLocation": "Leg",
    "outcome": {
      "@type": "MedicalEntity",
      "code": {
        "@type": "MedicalCode",
        "codeValue": "0123",
        "codingSystem": "ICD-10",
        "image": "https://www.qldxray.com.au/wp-content/uploads/2018/03/imaging-provider-mobile.jpg"
      }
    }
  }
  credentials.createVerification({
    sub: 'did:ethr:0xa0edad57408c00702a3f20476f687f3bf8b61ccf',
    exp: Time360Days(),
    claim: credentialSubject
  }).then(att => {
    var uri = message.paramsToQueryString(message.messageToURI(att), {
      callback_type: 'post'
    })
    const qr = transports.ui.getImageDataURI(uri)
    uri = helper.concatDeepUri(uri)
    messageLogger(att, 'Encoded VC Sent to User (Signed JWT)')
    messageLogger(decodeJWT(att), 'Decoded VC Payload of Above')
    res.render('retrieveVC', {
      qr:qr,
      uri:uri
    })
  })

})

app.post('/login', (req, res) => {
  const jwt = req.body.access_token
  const socketid = req.query['socketid']
  console.log('someone logged in...')
  if (jwt != null) {
    credentials.authenticateDisclosureResponse(jwt).then(creds => {
      messageLogger(decodeJWT(jwt), 'Shared VC from a User')
      const did = creds.did
      currentConnections[socketid].did = did
      currentConnections[socketid].socket.emit('loggedIn', did)
    })
  }
});


//Socket Events
io.on('connection', function(socket) {
  console.log('a user connected: ' + socket.id);
  currentConnections[socket.id] = {
    socket: socket
  };

  credentials.createDisclosureRequest({
    requested: ["Person"],
    notifications: false,
    callbackUrl: endpoint + '/login?socketid=' + socket.id
  }).then(requestToken => {
    var uri = message.paramsToQueryString(message.messageToURI(requestToken), {
      callback_type: 'post'
    })
    const qr = transports.ui.getImageDataURI(uri)
    uri = helper.concatDeepUri(uri)
    messageLogger(requestToken, "Request Token")
    socket.emit('qrLogin', {
      qr: qr,
      uri: uri
    })
  })

  socket.on('bookScan', function(booking) {
    console.log(currentConnections[socket.id].did + ' ' + booking.bookedTime)
    //31/05/2019 14:00
    let day = Number(booking.bookedTime.slice(0, 2))
    let month = Number(booking.bookedTime.slice(3, 5)) - 1
    let year = Number(booking.bookedTime.slice(6, 10))
    let hours = Number(booking.bookedTime.slice(11, 13))
    let minutes = Number(booking.bookedTime.slice(14, 16)) + 5
    let exp = (new Date(year, month, day, hours, minutes, 0, 0).getTime()) / 1000
    credentials.createVerification({
      sub: currentConnections[socket.id].did,
      exp: exp,
      claim: {
        "@context": "https://schema.org",
        "@type": "Reservation",
        "name": "X-Ray Scan Reservation",
        "bookingTime": booking.bookedTime,
        "reservationFor": {
          "@type": "MedicalProcedure",
          "bodyLocation": "Leg",
          "name": "X-Ray Scan"
        },
        "reservationId": "333444",
        "provider": {
          "@type": "Hospital",
          "name": booking.hospital,
        }
      }
    }).then(att => {
      var uri = message.paramsToQueryString(message.messageToURI(att), {
        callback_type: 'post'
      })
      const qr = transports.ui.getImageDataURI(uri)
      uri = helper.concatDeepUri(uri)
      messageLogger(att, 'Encoded VC Sent to User (Signed JWT)')
      messageLogger(decodeJWT(att), 'Decoded VC Payload of Above')
      currentConnections[socket.id].socket.emit('bookScanVC', {
        qr: qr,
        uri: uri
      })
    })
  })

  socket.on('disconnect', function() {
    console.log(socket.id + ' disconnected...')
    delete currentConnections[socket.id];
  })
});

http.listen(myhealth_port, () => {
  console.log(`http listening on port: ${myhealth_port}`)
  if (isDevEnv) {
    ngrok.connect(myhealth_port).then(ngrokUrl => {
      endpoint = ngrokUrl
      console.log(`MyHealth running, open at ${endpoint}`)
      open(endpoint, {
        app: 'chrome'
      })
    });
  }
})
