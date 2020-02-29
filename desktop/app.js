const { clipboard, nativeImage } = require('electron')
const { getConnectionCode } = require('./connection')

if (require('electron-is-dev')) {
  document.querySelector('#app-name').textContent = 'AirDash Dev'
}

document.querySelector('#location').value = locationFolder()
document.querySelector('#connection-id').textContent = getConnectionCode()

document.querySelector('#select-location').onclick = async () => {
  const { dialog } = require('electron').remote
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  })
  const location = result.filePaths[0]
  if (location) {
    localStorage.setItem('location', location)
    document.querySelector('#location').value = location
  }
}

// I add this "configs" here for now until some kind of user settings is in place 
// Set to true to copy files to clipboard
const COPY_FILE = true
// Enable receiving raw text and automatically paste to clipboard
const RAW_TEXT = true


let previousPeer = null
reconnect()

function reconnect() {
  if (previousPeer) previousPeer.destroy()
  const connectionCode = `flownio-airdash-${getConnectionCode()}`
  const peer = new peerjs.Peer(connectionCode)
  console.log(`Listening on ${connectionCode}...`)
  peer.on('connection', (conn) => {
    conn.on('open', () => {
      const hostname = require('os').hostname()
      const name = hostname
        .replace(/\.local/g, '')
        .replace(/-/g, ' ')
      conn.send({ type: 'connected', deviceName: name })
    })
    conn.on('data', (data) => {
      const batch = data.batch
      data = data.data
      console.log('data', data);
      // If enabled and is a string we copy to clipboard
      // TODO: this should be configured by the user at some point
      if (RAW_TEXT && typeof data === 'string') {
        clipboard.writeText(data)
        conn.send({ type: 'done' })
        notifyCopy(data)
        return
      }

      // If it's a file we receive an ArrayBuffer here
      if (data instanceof ArrayBuffer) {
        const path = require('path')
        const fs = require('fs')

        const batchSize = conn.metadata.batchSize
        const fileSize = conn.metadata.fileSize
        const filename = conn.metadata.filename
        const filepath = path.join(locationFolder(), filename)
        const filebuffer = new Buffer(data)

        if (batch === 0) {
          fs.writeFileSync(filepath, filebuffer)
        } else {
          fs.appendFileSync(filepath, filebuffer)
        }

        conn.send({ type: 'done', batch })

        if ((batch + 1) * batchSize >= fileSize) {
          fileReceivedSuccessfully(filepath, filename)
        }
      }
    })
  })
  previousPeer = peer
}

function fileReceivedSuccessfully(filepath, filename) {
  console.log('Received ' + filepath)

  // If enabled and is an image, write image to clipboard
  if (COPY_FILE && isImage(filename)) {
    clipboard.writeImage(
      nativeImage.createFromPath(filepath)
    )
  }

  notifyFileSaved(filename, filepath)
}

function notify(title, body, icon, opts = {}, cb) {
  const notifOptions = {
    body,
    icon,
    silent: true,
    ...opts,
  }

  const myNotification = new Notification(title, notifOptions)
  myNotification.onclick = () => {
    // we can do something when user click file,
    // for example open the directory, or preview the file
  }
}


function notifyCopy(data) {
  const title = `Received text`
  const body = data
  const image = `${__dirname}/trayIconTemplate@2x.png`
  notify(title, body, image)
}

function notifyFileSaved(filename, filepath) {
  const title = `New File`
  const body = `A new file has been saved, ${filename}`
  const image = `${__dirname}/trayIconTemplate@2x.png`
  notify(title, body, isImage(filename) ? filepath : image)
}

function isImage(filename) {
  return /jpg|png|jpeg|svg|gif|/.test(filename)
}

function locationFolder() {
  const path = require('path')
  const os = require('os')
  const desktopPath = path.join(os.homedir(), 'Desktop')
  return localStorage.getItem('location') || desktopPath
}
