const inputElement = document.querySelector(".chat-input")
const sendElement = document.querySelector(".send-btn")
const messagesElement = document.querySelector(".messages ul")
const loadingElement = document.querySelector(".loading")
const chatArea = document.querySelector(".chat-area")
const newChatBtn = document.querySelector(".new-chat-btn")
const actionButtons = document.querySelectorAll(".action-btn")
const aiSelector = document.querySelector(".ai-selector")
const recentsSection = document.querySelector(".recents-section")

let isLoading = false
let messageHistory = []
let currentChatId = null

const API_BASE_URL = window.location.origin

async function sendMessage(message) {
    if (!message.trim() || isLoading) return

    const userMessage = message.trim()
    
    addMessage(userMessage, 'user')
    
    messageHistory.push({ role: 'user', content: userMessage })
    
    inputElement.value = ''
    autoResize()
    setLoading(true)
    
    chatArea.classList.add('chat-started')

    try {
        const selectedAI = aiSelector.value
        const response = await sendMessageToAPI(userMessage, selectedAI, currentChatId)
        
        addMessage(response.message, 'ai')
        
        messageHistory.push({ role: 'assistant', content: response.message })
        currentChatId = response.chatId
        
        await loadChatHistory()
        
    } catch (error) {
        console.error('Error sending message:', error)
        handleAPIError(error)
    } finally {
        setLoading(false)
        inputElement.focus()
    }
}

async function sendMessageToAPI(message, aiModel, chatId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                message: message,
                aiModel: aiModel || 'Gemini',
                chatId: chatId
            })
        })

        const data = await response.json()
        
        if (!response.ok) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`)
        }

        if (!data.success) {
            throw new Error(data.error || 'API request failed')
        }

        return data
        
    } catch (error) {
        console.error('API Error:', error)
        throw error
    }
}

async function deleteChat(chatId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/chat/${chatId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            }
        })
        const data = await response.json()
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to delete chat')
        }

        if (currentChatId === chatId) {
            messagesElement.innerHTML = ''
            messageHistory = []
            currentChatId = null
            chatArea.classList.remove('chat-started')
        }
        
        await loadChatHistory()
        
        const feedback = document.createElement('div')
        feedback.textContent = 'Suhbat o‘chirildi'
        feedback.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #2d2d2d;
            color: white;
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 12px;
            z-index: 1000;
        `
        document.body.appendChild(feedback)
        setTimeout(() => {
            if (feedback.parentNode) {
                feedback.parentNode.removeChild(feedback)
            }
        }, 2000)
    } catch (error) {
        console.error('Error deleting chat:', error)
        showConnectionError()
    }
}

function handleAPIError(error) {
    let errorMessage = 'Xatolik yuz berdi. Qayta urinib ko\'ring.'
    
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        errorMessage = 'Internetga ulanish xatosi. Internet aloqangizni tekshiring.'
    } else if (error.message.includes('timeout')) {
        errorMessage = 'So\'rov vaqti tugadi. Qayta urinib ko\'ring.'
    } else if (error.message.includes('429') || error.message.includes('quota')) {
        errorMessage = 'Juda ko\'p so\'rov yuborildi. Biroz kutib qayta urinib ko\'ring.'
    } else if (error.message.includes('401')) {
        errorMessage = 'API key xatosi. Administrator bilan bog\'laning.'
    } else if (error.message.includes('400')) {
        errorMessage = 'Xabar formati noto\'g\'ri. Qayta urinib ko\'ring.'
    } else if (error.message.includes('404')) {
        errorMessage = 'Suhbat topilmadi. Yangi suhbat boshlang.'
    }
    
    addMessage(errorMessage, 'ai', true)
}

function addMessage(message, type, isError = false) {
    const liElement = document.createElement('li')
    liElement.textContent = message
    liElement.className = type
    
    if (isError) {
        liElement.classList.add('error-message')
        liElement.style.borderLeftColor = '#ff4444'
        liElement.style.backgroundColor = '#2d1f1f'
    }
    
    messagesElement.appendChild(liElement)
    
    setTimeout(() => {
        messagesElement.scrollTop = messagesElement.scrollHeight
    }, 100)
}

function setLoading(loading) {
    isLoading = loading
    loadingElement.style.display = loading ? 'flex' : 'none'
    sendElement.disabled = loading
    inputElement.disabled = loading
    
    if (loading) {
        sendElement.textContent = 'Yuborilmoqda...'
        sendElement.style.opacity = '0.7'
    } else {
        sendElement.textContent = 'Send'
        sendElement.style.opacity = '1'
    }
}

function autoResize() {
    inputElement.style.height = 'auto'
    const newHeight = Math.min(inputElement.scrollHeight, 200)
    inputElement.style.height = newHeight + 'px'
}

async function checkServerConnection() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`)
        const data = await response.json()
        
        if (data.status === 'OK') {
            console.log('✅ Server connection OK')
            return true
        }
    } catch (error) {
        console.error('❌ Server connection failed:', error)
        showConnectionError()
        return false
    }
}

function showConnectionError() {
    const errorDiv = document.createElement('div')
    errorDiv.innerHTML = `
        <div style="
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff4444;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 1000;
            font-size: 14px;
        ">
            ⚠️ Server bilan bog'lanishda xatolik
        </div>
    `
    
    document.body.appendChild(errorDiv)
    
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.parentNode.removeChild(errorDiv)
        }
    }, 5000)
}

async function loadChatHistory() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/chats`)
        const data = await response.json()
        
        if (data.success) {
            recentsSection.innerHTML = `
                <div class="recents-title">Recents</div>
                ${data.chats.length === 0 ? '<div class="no-chats">Hozircha suhbatlar yo‘q</div>' : 
                data.chats.map(chat => `
                    <div class="recent-item ${chat.id === currentChatId ? 'active' : ''}" data-chat-id="${chat.id}">
                        <span class="chat-title">${chat.title}</span>
                        <div class="chat-actions">
                            <span class="chat-date">${new Date(chat.createdAt).toLocaleDateString()}</span>
                            <button class="delete-chat-btn" data-chat-id="${chat.id}">🗑️</button>
                        </div>
                    </div>
                `).join('')}
            `
            
            document.querySelectorAll('.recent-item').forEach(item => {
                item.addEventListener('click', async (e) => {
                    if (e.target.classList.contains('delete-chat-btn')) {
                        const chatId = e.target.dataset.chatId
                        await deleteChat(chatId)
                    } else {
                        document.querySelectorAll('.recent-item').forEach(i => i.classList.remove('active'))
                        item.classList.add('active')
                        const chatId = item.dataset.chatId
                        await loadChat(chatId)
                    }
                })
            })
        } else {
            throw new Error(data.error || 'Failed to load chats')
        }
    } catch (error) {
        console.error('Error loading chat history:', error)
        showConnectionError()
    }
}

async function loadChat(chatId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/chat/${chatId}`)
        const data = await response.json()
        
        if (data.success) {
            currentChatId = chatId
            messagesElement.innerHTML = ''
            messageHistory = data.chat.messages
            
            data.chat.messages.forEach(msg => {
                addMessage(msg.content, msg.role === 'user' ? 'user' : 'ai')
            })
            
            chatArea.classList.add('chat-started')
            inputElement.focus()
            await loadChatHistory()
        } else {
            throw new Error(data.error || 'Failed to load chat')
        }
    } catch (error) {
        console.error('Error loading chat:', error)
        showConnectionError()
    }
}

sendElement.addEventListener('click', () => {
    sendMessage(inputElement.value)
})

inputElement.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendMessage(inputElement.value)
    }
})

inputElement.addEventListener('input', autoResize)

inputElement.addEventListener('input', () => {
    const maxLength = 2000
    const currentLength = inputElement.value.length
    
    const existingCounter = document.querySelector('.char-counter')
    if (existingCounter) {
        existingCounter.remove()
    }
    
    if (currentLength > maxLength * 0.8) {
        const counter = document.createElement('div')
        counter.className = 'char-counter'
        counter.textContent = `${currentLength}/${maxLength}`
        counter.style.cssText = `
            position: absolute;
            bottom: 8px;
            left: 20px;
            font-size: 12px;
            color: ${currentLength > maxLength ? '#ff4444' : '#888'};
        `
        
        inputElement.parentElement.appendChild(counter)
        sendElement.disabled = currentLength > maxLength || isLoading
    }
})

newChatBtn.addEventListener('click', () => {
    messagesElement.innerHTML = ''
    messageHistory = []
    currentChatId = null
    chatArea.classList.remove('chat-started')
    inputElement.value = ''
    autoResize()
    inputElement.focus()
    
    const counter = document.querySelector('.char-counter')
    if (counter) counter.remove()
    
    document.querySelectorAll('.recent-item').forEach(item => item.classList.remove('active'))
    loadChatHistory()
})

actionButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const action = btn.className.split(' ')[1]
        const prompts = {
            'write': 'Menga yozishda yordam bering: ',
            'learn': 'Menga bu haqida o\'rgating: ',
            'code': 'Kod yozishda yordam bering: ',
            'life': 'Hayotiy masalada maslahat bering: ',
            'choice': 'Menga qiziqarli narsa aytib bering!'
        }
        
        if (prompts[action]) {
            inputElement.value = prompts[action]
            inputElement.focus()
            autoResize()
            
            if (action === 'choice') {
                sendMessage(prompts[action])
            } else {
                setTimeout(() => {
                    inputElement.setSelectionRange(inputElement.value.length, inputElement.value.length)
                }, 50)
            }
        }
    })
})

aiSelector.addEventListener('change', () => {
    console.log('Selected AI:', aiSelector.value)
    
    const feedback = document.createElement('div')
    feedback.textContent = `${aiSelector.value} tanlandi`
    feedback.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #2d2d2d;
        color: white;
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 12px;
        z-index: 1000;
    `
    
    document.body.appendChild(feedback)
    
    setTimeout(() => {
        if (feedback.parentNode) {
            feedback.parentNode.removeChild(feedback)
        }
    }, 2000)
})

window.addEventListener('load', async () => {
    inputElement.focus()
    await checkServerConnection()
    await loadChatHistory()
})

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        console.log('Clicked:', item.textContent)
    })
})

document.querySelector('.upgrade').addEventListener('click', () => {
    alert('Upgrade funksiyasi keyinroq qo\'shiladi')
})

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        sendMessage(inputElement.value)
    }
    
    if (e.key === 'Escape') {
        inputElement.value = ''
        autoResize()
        inputElement.focus()
    }
})

document.addEventListener('submit', (e) => {
    e.preventDefault()
})

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        inputElement.focus()
    }
})

let draftTimer
inputElement.addEventListener('input', () => {
    clearTimeout(draftTimer)
    draftTimer = setTimeout(() => {
        if (inputElement.value.trim()) {
            localStorage.setItem('chatDraft', inputElement.value)
        } else {
            localStorage.removeItem('chatDraft')
        }
    }, 1000)
})

window.addEventListener('load', () => {
    const draft = localStorage.getItem('chatDraft')
    if (draft) {
        inputElement.value = draft
        autoResize()
    }
})

function clearDraft() {
    localStorage.removeItem('chatDraft')
}

const originalSendMessage = sendMessage
sendMessage = function(message) {
    if (message.trim()) {
        clearDraft()
    }
    return originalSendMessage.call(this, message)
}