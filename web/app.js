(async function() {
  try {
    await navigator.serviceWorker.register('./sw.js')
  } catch (err) {
    console.log('sw failed', err)
  }

  render()

  if (window.location.host.includes('localhost')) {
    document.querySelector('h1').textContent = 'AirDash Dev'
  }

  setupInstallPrompt()
  await handleStoredFile()
})()

const primaryColor = '#25AE88'
let showAddButton = true

function render() {
  const content = `
    <section style="margin-top: 30px;">
        <img src="./logo.png" style="width: 35px;  float: left;">
        <h1 style="font-size: 20px; float: left; line-height: 35px; padding-left: 10px; margin: 0">
            AirDash
        </h1>
        <div style="clear: both;"></div>
    </section>
    <section>
        <p>Share photos, documents and other files from <a href="https://flown.io/airdash" target="_blank">Web</a> and <a href="#" id="android-install">Android</a> to <a href="https://flown.io/airdash/AirDash-Win32.zip">Windows</a> and <a href="https://flown.io/airdash/AirDash.dmg">Mac</a>.</p>
    </section>
    <section>
        <form>
            ${Object.entries(getDevices()).map(([id, obj], i) => renderDeviceRow(id, obj, id === getConnectionId())).join('')}
        </form>
        <div style="margin: 10px 0;">${renderAddDevice()}</div>
    </section>
    <section style="margin-bottom: 40px">
        <p id="message" style="min-height: 20px;"></p>
        <form id="file-form" action="./" method="POST" enctype="multipart/form-data">
            <input name="form" type="hidden" value="true">
            <label for="file-input" id="file-button">Select file to send</label>
            <input id="file-input" onchange="fileChanged(this)" name="formfile" type="file" style="opacity: 0; position: absolute; z-index: -1">
        </form>
    </section>
  `
  document.querySelector('#content').innerHTML = content

  if (!showAddButton) {
    new Cleave('#code-input', {
      delimiter: '-',
      blocks: [3, 3, 3],
      numericOnly: true
    });
  }

}

function renderAddDevice() {
  if (showAddButton) {
    return `<button style="cursor: pointer; background: none; border: none; outline: 0; color: ${primaryColor}; padding: 10px 0;" onclick="addDeviceClicked(this)">+ Add Receiving Device</button>`
  } else {
    const codeInputs = `<input id="code-input" oninput="addDeviceInputChanged(this)" onfocusout="addDeviceInputFocusOut(this)">`
    return codeInputs + `<p>Enter device code</p>`
  }
}

function addDeviceInputFocusOut(element) {
  if (!element.disabled) {
    showAddButton = true
    render()
  }
}

function addDeviceClicked() {
  showAddButton = false
  render()
  document.querySelector('#code-input').focus()
}

function addDeviceInputChanged(element) {
  if (element.value.length === 11) {
    const code = document.querySelector('#code-input').value
    addDevice(code, element)
  }
}

function getDevices() {
  const devices = JSON.parse(localStorage.getItem('devices') || '{}')
  return devices
}

async function addDevice(code, element) {
  element.disabled = true
  setStatus('Connecting...')
  try {
    const result = await tryConnection(code)
    const newDevice = {name: result.name || code, addedAt: new Date()}
    const devices = getDevices()
    devices[code] = newDevice
    localStorage.setItem('devices', JSON.stringify(devices))
    render()
  } catch(error) {
    setStatus(error)
    element.disabled = false
    element.focus()
  }
}

function renderDeviceRow(id, device, checked) {
  return `
    <div class="device" style="margin-bottom: 10px; cursor: pointer;" onclick="deviceRowClicked(this)">
        <label class="mdl-radio mdl-js-radio mdl-js-ripple-effect" style="padding-right: 15px;">
            <input class="device-radio" type="radio" id="${id}" onchange="deviceClicked(this)" name="device" value="${id}" ${checked ? 'checked' : ''}>
        </label>
        <div style="display: inline-block; vertical-align: middle;">
            <div style="font-size: 18px">${device.name}</div>
            <div style="font-size: 14px; color: #555;">
                <span class="device-status-indicator" style="border-radius: 10px; width: 10px; height: 10px; background: ${primaryColor}; margin-right: 5px; display: inline-block"></span> 
                <span class="device-status">${id}</span>
            </div>
        </div>
    </div>
  `
}

function deviceRowClicked(element) {
  element.querySelector('input').checked = true
}

function deviceClicked(element) {
  localStorage.setItem('connection-id', element.value)
}

function setupInstallPrompt() {
  let deferredPrompt;
  document.querySelector('#android-install').addEventListener('click', () => {
    deferredPrompt.prompt();
  })
  window.addEventListener('beforeinstallprompt', (e) => {
    deferredPrompt = e;
  });
}

function getConnectionId() {
  return localStorage.getItem('connection-id') || ''
}

function fileChanged(element) {
  console.log('File picked', element.files[0].name)
  document.querySelector('#file-form').submit()
  setStatus('Preparing...')
}

async function handleStoredFile() {
  const error = await localforage.getItem('error')
  const file = await localforage.getItem('file')
  if (error) {
    setStatus('Error: ' + error)
  } else if (file) {
    const filename = await localforage.getItem('filename') || 'unknown'
    await localforage.clear()
    try {
      await sendFile(file, filename)
    } catch (err) {
      setStatus(err)
    }
  } else {
    setStatus('Ready')
  }
}

async function tryConnection(deviceCode) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject('Connection timed out. Make sure the device code is correct and try again.')
    }, 5000)

    const peer = new peerjs.Peer()
    const connectionId = `flownio-airdash-${deviceCode}`
    const conn = peer.connect(connectionId)
    conn.on('open', async function() {
      console.log('sdf')
      clearTimeout(timeout)
      peer.destroy()
      resolve('success')
    })
    conn.on('error', function(err) {
      console.log('err', err)
      reject(err)
    })
  })
}

async function sendFile(file, filename) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject('Connection timed out. Make sure the device id is correct and try again.')
    }, 5000)

    const peer = new peerjs.Peer()
    const id = getConnectionId() || ''
    const connectionId = `flownio-airdash-${id}`
    if (!id) return
    setStatus('Connecting...')
    console.log(`Sending ${filename} to ${connectionId}...`)
    const conn = peer.connect(connectionId, { metadata: { filename } })
    conn.on('open', async function() {
      clearTimeout(timeout)
      setStatus('Sending...')
      conn.send(file)
    })
    conn.on('data', async function(data) {
      if (data === 'done') {
        setStatus('Sent ' + filename)
        resolve('done')
      } else {
        console.log('unknown message', data)
        setStatus('Unknown message ' + data)
        reject(data)
      }
    })
    conn.on('error', function(err) {
      console.log('err', err)
      setStatus(err)
      reject(err)
    })
  })
}

function setStatus(status) {
  document.querySelector('#message').textContent = status
}