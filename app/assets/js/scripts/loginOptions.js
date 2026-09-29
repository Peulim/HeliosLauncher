const loginOptionsCancelContainer = document.getElementById('loginOptionCancelContainer')
const loginOptionMicrosoft = document.getElementById('loginOptionMicrosoft')
const loginOptionOffline = document.getElementById('loginOptionOffline')
const loginOptionsCancelButton = document.getElementById('loginOptionCancelButton')

let loginOptionsCancellable = false

let loginOptionsViewOnLoginSuccess = VIEWS.landing
let loginOptionsViewOnLoginCancel
let loginOptionsViewOnCancel
let loginOptionsViewCancelHandler

function loginOptionsCancelEnabled(val){
    if(val){
        $(loginOptionsCancelContainer).show()
    } else {
        $(loginOptionsCancelContainer).hide()
    }
}

loginOptionMicrosoft.onclick = (e) => {
    resetOfflineLoginForm()
    switchView(getCurrentView(), VIEWS.waiting, 500, 500, () => {
        ipcRenderer.send(
            MSFT_OPCODE.OPEN_LOGIN,
            loginOptionsViewOnLoginSuccess,
            loginOptionsViewOnLoginCancel
        )
    })
}

const offlineLoginForm = document.getElementById('offlineLoginForm')
const offlineUsername = document.getElementById('offlineUsername')
const offlineLoginError = document.getElementById('offlineLoginError')
const offlineLoginButton = document.getElementById('offlineLoginButton')

function resetOfflineLoginForm(){
    offlineLoginForm.hidden = true
    offlineUsername.value = ''
    offlineUsername.removeAttribute('aria-invalid')
    offlineLoginError.textContent = ''
    offlineLoginButton.disabled = false
    loginOptionOffline.setAttribute('aria-expanded', 'false')
}

function showOfflineLoginForm(){
    offlineLoginForm.hidden = false
    loginOptionOffline.setAttribute('aria-expanded', 'true')
    offlineUsername.focus()
}

loginOptionOffline.onclick = showOfflineLoginForm
offlineUsername.oninput = () => {
    offlineLoginError.textContent = ''
    offlineUsername.removeAttribute('aria-invalid')
}
offlineLoginForm.onsubmit = (event) => {
    event.preventDefault()
    if(offlineLoginButton.disabled) return
    if(!/^[A-Za-z0-9_]{3,16}$/.test(offlineUsername.value)){
        offlineLoginError.textContent = 'Use de 3 a 16 letras, números ou sublinhado (_), sem espaços.'
        offlineUsername.setAttribute('aria-invalid', 'true')
        offlineUsername.focus()
        return
    }
    offlineLoginButton.disabled = true
    try {
        const account = AuthManager.addOfflineAccount(offlineUsername.value)
        updateSelectedAccount(account)
    } catch(err) {
        console.error('Offline login failed', err)
        offlineLoginError.textContent = 'Não foi possível salvar a conta. Tente novamente.'
        offlineLoginButton.disabled = false
        return
    }
    const destination = loginOptionsViewOnLoginSuccess || VIEWS.landing
    loginOptionsViewCancelHandler = null
    switchView(getCurrentView(), destination, 500, 500, async () => {
        resetOfflineLoginForm()
        loginOptionsViewOnLoginSuccess = VIEWS.landing
        loginOptionsCancelEnabled(false)
        if(destination === VIEWS.settings) await prepareSettings()
    })
}

loginOptionsCancelButton.onclick = (e) => {
    resetOfflineLoginForm()
    switchView(getCurrentView(), loginOptionsViewOnCancel, 500, 500, () => {
        // Clear login values (Mojang login)
        // No cleanup needed for Microsoft.
        loginUsername.value = ''
        loginPassword.value = ''
        if(loginOptionsViewCancelHandler != null){
            loginOptionsViewCancelHandler()
            loginOptionsViewCancelHandler = null
        }
    })
}