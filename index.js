var Peer = require('simple-peer')

var DELAY = 250
var HEARTBEAT = 1000

var DEFAULTS = {
  peerOptions: {
    trickle: false
  },
  quiet: false,
  hostButtonText: 'Host',
  joinButtonText: 'Join',
  sendInviteText: '1. Send invite code to guest:',
  sendInvitePlaceholder: 'Invite code',
  pasteGuestAnswerText: '2. Paste guest\'s answer code:',
  pasteGuestAnswerPlaceholder: 'Guest\'s answer code',
  guestConnectionEstablishedText: 'Connection to guest established',
  guestConnectionClosedText: 'Connection to guest closed',
  pasteHostInviteText: '1. Paste host\'s invite code:',
  pasteHostInvitePlaceholder: 'Host\'s invite code',
  sendHostAnswerText: '2. Send answer code to host:',
  sendHostAnswerPlaceholder: 'Host\'s answer code',
  hostConnectionEstablishedText: 'Connection to host established',
  hostConnectionClosedText: 'Connection to host closed',
  onSignal: function(){},
  onConnect: function(){},
  onClose: function(){},
  onError: function(){},
  onData: function(){},
  onStream: function(){},
  onMessage: function(){},
  mountStyle: {
    fontFamily: 'Helvetica, Arial, sans-serif',
    fontSize: '12px',
    textAlign: 'center',
    border: '0',
    padding: '0',
    margin: 'auto'
  },
  inputStyle: {
    outline: 'none',
    padding: '2px',
    margin: '2px'
  },
  labelStyle: {
    padding: '2px',
    margin: '2px'
  },
  buttonStyle: {
    padding: '4px',
    margin: '2px',
    cursor: 'pointer'
  },
  textStyle: {
    padding: '4px',
    margin: '2px'
  }
}

function assignDefaults (a, b) {
  for (var key in b) {
    if (a[key] === undefined && b[key] !== undefined) {
      a[key] = b[key]
    }
  }
  return a
}

function applyStyle (el, style) {
  if (!style) return void (0)
  for (var key in style) {
    el.style[key] = style[key]
  }
  return el
}

function encodeObject (obj) {
  try {
    return btoa(JSON.stringify(obj))
  } catch (exception) {
    console.error(exception)
    return null
  }
}

function decodeString (str) {
  try {
    return JSON.parse(atob(str))
  } catch (exception) {
    console.error(exception)
    return null
  }
}

function BrowserPeer ($mount, options, cb) {
  if (!options) options = {}
  assignDefaults(options, DEFAULTS)

  applyStyle($mount, options.mountStyle)

  var $hostbtn = document.createElement('button')
  applyStyle($hostbtn, options.buttonStyle)
  $hostbtn.textContent = options.hostButtonText

  var $joinbtn = document.createElement('button')
  applyStyle($joinbtn, options.buttonStyle)
  $joinbtn.textContent = options.joinButtonText

  $mount.appendChild($hostbtn)
  $mount.appendChild($joinbtn)

  function appendMessage (el, text) {
    el.textContent = ''
    var para = document.createElement('p')
    applyStyle(para, options.textStyle)
    para.textContent = text
    el.appendChild(para)
  }

  /**
   *
   * === HOST ===
   *
   */

  $hostbtn.addEventListener('click', function _hostButtonClick () {
    $mount.innerHTML = ''

    var peerOptions = assignDefaults({ initiator: true }, options.peerOptions)
    var host = new Peer(peerOptions)
    if (!options.quiet) console.info('[BrowserPeer|host] options:', peerOptions)
    var instance = { peer: host, element: $mount, isHost: true, isGuest: false, options: peerOptions, isConnected: false }

    host.on('signal', function _hostSignalReceive (signal) {
      if (options.onSignal) options.onSignal(instance, signal)
      if (!options.quiet) console.info('[BrowserPeer|host] received signal:', signal)
      var encoded = encodeObject(signal)
      if (!encoded) return void (0)

      if (signal.type === 'offer') {
        var $invite = document.createElement('input')
        applyStyle($invite, options.inputStyle)
        $invite.setAttribute('type', 'text')
        $invite.setAttribute('placeholder', options.sendInvitePlaceholder)
        $invite.value = encoded
        $invite.onfocus = $invite.select.bind($invite)

        var $invitelabel = document.createElement('label')
        applyStyle($invitelabel, options.labelStyle)
        $invitelabel.textContent = options.sendInviteText

        var $accept = document.createElement('input')
        applyStyle($accept, options.inputStyle)
        $accept.setAttribute('type', 'text')
        $accept.setAttribute('placeholder', options.pasteGuestAnswerPlaceholder)
        $accept.addEventListener('change', function _hostAcceptChangeEvent (changeEvent) {
          var decoded = decodeString(changeEvent.target.value)
          if (!decoded) return void(0)
          if (!options.quiet) console.info('[BrowserPeer|host] sending acceptance:', decoded)
          host.signal(decoded)
        })

        var $acceptlabel = document.createElement('label')
        applyStyle($acceptlabel, options.labelStyle)
        $acceptlabel.textContent = options.pasteGuestAnswerText

        $mount.appendChild($invitelabel)
        $mount.appendChild($invite)

        $mount.appendChild($acceptlabel)
        $mount.appendChild($accept)
      }
    })

    host.on('connect', function _hostConnect () {
      instance.isConnected = true
      if (options.onConnect) options.onConnect(instance)
      if (!options.quiet) console.info('[BrowserPeer|host] received connection')
      appendMessage($mount, options.guestConnectionEstablishedText)

      // HACK: Work around for guest not firing connect event - send them a message to force it.
      // Timeout required due to a race condition I don't fully understand
      var heartbeats = 0
      instance.heartbeatInterval = setInterval(function _timeout () {
        host.message({ heartbeat: heartbeats++ })
      }, HEARTBEAT)
    })

    host.on('close', function _hostClose () {
      instance.isConnected = false
      clearInterval(instance.heartbeatInterval)
      if (options.onClose) options.onClose(instance)
      if (!options.quiet) console.info('[BrowserPeer|host] connection closed')
      appendMessage($mount, options.guestConnectionClosedText)
    })

    host.on('error', function _hostError (error) {
      if (options.onError) options.onError(instance, error)
      clearInterval(instance.heartbeatInterval)
      console.error(error)
      appendMessage($mount, error.message)
    })

    host.message = function _hostMessage (object) {
      return host.send(JSON.stringify(object))
    }

    host.on('data', function _hostData (buffer) {
      if (!instance.isConnected) { // HACK: Workaround for not receiving connect event bug
        host.emit('connect')
      }

      if (options.onData) options.onData(instance, buffer)
      var string = buffer.toString()
      try {
        var object = JSON.parse(string)
        if (options.onMessage) options.onMessage(instance, object)
        host.emit('message', object)
      } catch (exception) {
        return void (0)
      }
    })

    host.on('stream', function _streamData (stream) {
      if (options.onStream) options.onStream(instance, stream)
    })

    BrowserPeer.instances.push(instance)
    if (cb) cb(null, instance)
  })

  /**
   *
   * === JOIN ===
   *
   */

  $joinbtn.addEventListener('click', function _joinButtonClick () {
    $mount.innerHTML = ''

    var peerOptions = assignDefaults({ initiator: false }, options.peerOptions)
    if (!options.quiet) console.info('[BrowserPeer|guest] options:', peerOptions)
    var guest = new Peer(peerOptions)
    var instance = { peer: guest, element: $mount, isHost: false, isGuest: true, options: peerOptions, isConnected: false }

    var $join = document.createElement('input')
    applyStyle($join, options.inputStyle)
    $join.setAttribute('type', 'text')
    $join.setAttribute('placeholder', options.pasteHostInvitePlaceholder)
    $join.addEventListener('change', function _joinChangeEvent (changeEvent) {
      var decoded = decodeString(changeEvent.target.value)
      if (!decoded) return void(0)
      if (!options.quiet) console.info('[BrowserPeer|guest] sending acceptance:', decoded)
      guest.signal(decoded)
    })

    var $joinlabel = document.createElement('label')
    applyStyle($joinlabel, options.labelStyle)
    $joinlabel.textContent = options.pasteHostInviteText

    $mount.appendChild($joinlabel)
    $mount.appendChild($join)

    guest.on('signal', function _joinSignalReceive (signal) {
      if (options.onSignal) options.onSignal(instance, signal)
      if (!options.quiet) console.info('[BrowserPeer|guest] received signal:', signal)
      var encoded = encodeObject(signal)
      if (!encoded) return void (0)

      if (signal.type === 'answer') {
        $mount.removeChild($join)
        $mount.removeChild($joinlabel)

        // Delay to make it a bit more obvious that the field has changed
        setTimeout(function () {
          var $finalize = document.createElement('input')
          applyStyle($finalize, options.inputStyle)
          $finalize.setAttribute('type', 'text')
          $finalize.setAttribute('placeholder', options.sendHostAnswerPlaceholder)
          $finalize.value = encoded
          $finalize.onfocus = $finalize.select.bind($finalize)

          var $finalizelabel = document.createElement('label')
          applyStyle($finalizelabel, options.labelStyle)
          $finalizelabel.textContent = options.sendHostAnswerText

          $mount.appendChild($finalizelabel)
          $mount.appendChild($finalize)
        }, DELAY)
      }
    })

    guest.on('connect', function _guestConnect () {
      instance.isConnected = true
      if (options.onConnect) options.onConnect(instance)
      if (!options.quiet) console.info('[BrowserPeer|guest] received connection')
      appendMessage($mount, options.hostConnectionEstablishedText)

      var heartbeats = 0
      instance.heartbeatInterval = setInterval(function _timeout () {
        guest.message({ heartbeat: heartbeats++ })
      }, HEARTBEAT)
    })

    guest.on('close', function _guestClose () {
      instance.isConnected = false
      clearInterval(instance.heartbeatInterval)
      if (options.onClose) options.onClose(instance)
      if (!options.quiet) console.info('[BrowserPeer|guest] connection closed')
      appendMessage($mount, options.hostConnectionClosedText)
    })

    guest.on('error', function _guestError (error) {
      if (options.onError) options.onError(instance, error)
      clearInterval(instance.heartbeatInterval)
      console.error(error)
      appendMessage($mount, error.message)
    })

    guest.message = function _guestMessage (object) {
      return guest.send(JSON.stringify(object))
    }

    guest.on('data', function _guestData (buffer) {
      if (!instance.isConnected) { // HACK: Workaround for not receiving connect event bug
        guest.emit('connect')
      }

      if (options.onData) options.onData(instance, buffer)
      var string = buffer.toString()
      try {
        var object = JSON.parse(string)
        if (options.onMessage) options.onMessage(instance, object)
        guest.emit('message', object)
      } catch (exception) {
        return void (0)
      }
    })

    guest.on('stream', function _streamData (stream) {
      if (options.onStream) options.onStream(instance, stream)
    })

    BrowserPeer.instances.push(instance)
    if (cb) cb(null, instance)
  })
}

BrowserPeer.instances = []

module.exports = BrowserPeer
