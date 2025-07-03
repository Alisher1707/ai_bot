import express from "express"
import cors from "cors"
import bodyParser from "body-parser"
import { GoogleGenerativeAI } from "@google/generative-ai"
import path from "path"
import { fileURLToPath } from "url"
import dotenv from "dotenv"
import rateLimit from "express-rate-limit"
import fs from "fs/promises"

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

if (!process.env.GOOGLE_API_KEY) {
    console.error('❌ GOOGLE_API_KEY environment variable is required!')
    console.log('📝 Create a .env file with: GOOGLE_API_KEY=your_api_key_here')
    process.exit(1)
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)

const app = express()

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100, 
    message: {
        success: false,
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
})

app.use(cors({
    origin: [
        'http://localhost:3000', 
        'http://127.0.0.1:3000', 
        'http://localhost:5500', 
        'http://127.0.0.1:5500',
        'http://localhost:8080',
        'http://127.0.0.1:8080'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}))

app.use(bodyParser.json({ limit: '10mb' }))
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }))
app.use(express.static(path.join(__dirname, '../web'))) 

app.use('/api/', limiter)

console.log("✅ Server initialized successfully")

function validateChatInput(message, aiModel) {
    const errors = []
    if (!message) {
        errors.push('Message is required')
    }
    if (typeof message !== 'string') {
        errors.push('Message must be a string')
    }
    if (message && message.trim().length === 0) {
        errors.push('Message cannot be empty')
    }
    if (message && message.length > 2000) {
        errors.push('Message is too long (max 2000 characters)')
    }
    if (aiModel && typeof aiModel !== 'string') {
        errors.push('AI model must be a string')
    }
    return errors
}

const chatsFilePath = path.join(__dirname, 'chats.json')

async function initializeChatsFile() {
    try {
        await fs.access(chatsFilePath)
    } catch (error) {
        console.log('📄 chats.json fayli mavjud emas, yangi fayl yaratilmoqda...')
        await fs.writeFile(chatsFilePath, JSON.stringify([], null, 2))
    }
}

async function readChats() {
    try {
        await initializeChatsFile()
        const data = await fs.readFile(chatsFilePath, 'utf-8')
        return JSON.parse(data)
    } catch (error) {
        console.error(`❌ chats.json o'qishda xato:`, error.message)
        return []
    }
}

async function writeChats(chats) {
    try {
        await fs.writeFile(chatsFilePath, JSON.stringify(chats, null, 2))
        console.log('✅ chats.json fayliga yozildi')
    } catch (error) {
        console.error('❌ chats.json yozishda xato:', error.message)
        throw error
    }
}

// 🔄 TUZATILGAN CHAT ENDPOINT
app.post("/api/chat", async (req, res) => {
    try {
        const { message, aiModel, chatId } = req.body
        
        const validationErrors = validateChatInput(message, aiModel)
        if (validationErrors.length > 0) {
            return res.status(400).json({ 
                success: false,
                error: "Validation failed",
                details: validationErrors
            })
        }

        const cleanMessage = message.trim()
        console.log(`📝 Received message: ${cleanMessage.substring(0, 100)}${cleanMessage.length > 100 ? '...' : ''}`)
        console.log(`🤖 AI Model: ${aiModel || 'Gemini'}`)
        console.log(`🆔 Chat ID: ${chatId || 'Yangi suhbat'}`)

        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            generationConfig: {
                temperature: 0.7,
                topP: 0.95,
                topK: 64,
                maxOutputTokens: 8192,
            },
        })
        
        // 📚 Suhbat tarixini olish
        let chats = await readChats()
        let currentChat
        let conversationHistory = []

        if (chatId) {
            currentChat = chats.find(chat => chat.id === chatId)
            if (currentChat) {
                // Oldingi xabarlarni Gemini formatiga moslashtirish
                conversationHistory = currentChat.messages.map(msg => ({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }]
                }))
                console.log(`📋 Suhbat tarixi yuklandi: ${conversationHistory.length} xabar`)
            } else {
                throw new Error('Chat ID not found')
            }
        }

        let result, response, text

        if (conversationHistory.length > 0) {
            // 🔄 Mavjud suhbatni davom ettirish
            const chat = model.startChat({
                history: conversationHistory,
                generationConfig: {
                    maxOutputTokens: 8192,
                },
            })

            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Request timeout')), 30000) 
            })
            
            const generatePromise = chat.sendMessage(cleanMessage)
            result = await Promise.race([generatePromise, timeoutPromise])
            response = await result.response
            text = response.text()
        } else {
            // 🆕 Yangi suhbat boshlash
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Request timeout')), 30000) 
            })
            
            const generatePromise = model.generateContent(cleanMessage)
            result = await Promise.race([generatePromise, timeoutPromise])
            response = await result.response
            text = response.text()
        }

        if (!text || text.trim().length === 0) {
            throw new Error('Empty response from AI')
        }

        // 💾 Javobni saqlash
        if (chatId && currentChat) {
            currentChat.messages.push(
                { role: 'user', content: cleanMessage, timestamp: new Date().toISOString() },
                { role: 'assistant', content: text.trim(), timestamp: new Date().toISOString() }
            )
        } else {
            currentChat = {
                id: Math.random().toString(36).substring(2, 10),
                title: cleanMessage.substring(0, 30) + (cleanMessage.length > 30 ? '...' : ''),
                messages: [
                    { role: 'user', content: cleanMessage, timestamp: new Date().toISOString() },
                    { role: 'assistant', content: text.trim(), timestamp: new Date().toISOString() }
                ],
                createdAt: new Date().toISOString()
            }
            chats.push(currentChat)
        }

        await writeChats(chats)

        console.log("✅ AI Response generated and saved successfully")

        res.json({ 
            success: true,
            message: text.trim(),
            model: aiModel || 'Gemini',
            timestamp: new Date().toISOString(),
            messageLength: text.length,
            chatId: currentChat.id
        })
        
    } catch (error) {
        console.error("❌ Error generating content:", error.message)
        let statusCode = 500
        let errorMessage = "Internal server error"
        if (error.message.includes('API key')) {
            statusCode = 401
            errorMessage = "API key error"
        } else if (error.message.includes('timeout')) {
            statusCode = 408
            errorMessage = "Request timeout"
        } else if (error.message.includes('quota')) {
            statusCode = 429
            errorMessage = "API quota exceeded"
        } else if (error.message.includes('Chat ID not found')) {
            statusCode = 404
            errorMessage = "Chat ID not found"
        }
        
        res.status(statusCode).json({ 
            success: false,
            error: errorMessage,
            timestamp: new Date().toISOString(),
            requestId: Math.random().toString(36).substring(7)
        })
    }
})

app.get("/api/chats", async (req, res) => {
    try {
        const chats = await readChats()
        res.json({
            success: true,
            chats: chats.map(chat => ({
                id: chat.id,
                title: chat.title,
                createdAt: chat.createdAt
            }))
        })
    } catch (error) {
        console.error("❌ Error fetching chats:", error.message)
        res.status(500).json({
            success: false,
            error: "Failed to fetch chats",
            timestamp: new Date().toISOString()
        })
    }
})

app.get("/api/chat/:id", async (req, res) => {
    try {
        const chats = await readChats()
        const chat = chats.find(c => c.id === req.params.id)
        if (!chat) {
            return res.status(404).json({
                success: false,
                error: "Chat not found",
                timestamp: new Date().toISOString()
            })
        }
        res.json({
            success: true,
            chat
        })
    } catch (error) {
        console.error("❌ Error fetching chat:", error.message)
        res.status(500).json({
            success: false,
            error: "Failed to fetch chat",
            timestamp: new Date().toISOString()
        })
    }
})

app.delete("/api/chat/:id", async (req, res) => {
    try {
        const chats = await readChats()
        const updatedChats = chats.filter(chat => chat.id !== req.params.id)
        if (chats.length === updatedChats.length) {
            return res.status(404).json({
                success: false,
                error: "Chat not found",
                timestamp: new Date().toISOString()
            })
        }
        await writeChats(updatedChats)
        res.json({
            success: true,
            message: "Chat deleted successfully",
            timestamp: new Date().toISOString()
        })
    } catch (error) {
        console.error("❌ Error deleting chat:", error.message)
        res.status(500).json({
            success: false,
            error: "Failed to delete chat",
            timestamp: new Date().toISOString()
        })
    }
})

app.post("/prompt", async (req, res) => {
    try {
        const { prompt } = req.body
        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
            return res.status(400).json({ 
                error: "Valid prompt is required" 
            })
        }

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })
        const result = await model.generateContent(prompt.trim())
        const response = await result.response
        const text = response.text()

        res.json({ 
            message: text.trim(),
            timestamp: new Date().toISOString()
        })
        
    } catch (error) {
        console.error("❌ Error in /prompt endpoint:", error.message)
        res.status(500).json({ 
            error: "Internal server error",
            timestamp: new Date().toISOString()
        })
    }
})

app.get("/health", (req, res) => {
    const healthData = {
        status: "OK", 
        timestamp: new Date().toISOString(),
        uptime: `${Math.floor(process.uptime())} seconds`,
        memory: {
            used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
            total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`
        },
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development'
    }
    
    console.log("🏥 Health check requested")
    res.json(healthData)
})

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, '../web/index.html'))
})

app.get("/api/status", (req, res) => {
    res.json({
        status: "API is running",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        endpoints: {
            "POST /api/chat": "Main chat endpoint with AI",
            "POST /prompt": "Legacy prompt endpoint", 
            "GET /health": "Health check endpoint",
            "GET /api/status": "API status information",
            "GET /api/chats": "List all chats",
            "GET /api/chat/:id": "Get specific chat",
            "DELETE /api/chat/:id": "Delete specific chat",
            "GET /": "Frontend application"
        },
        rateLimit: {
            windowMs: "15 minutes",
            max: "100 requests per IP"
        }
    })
})

app.get("/api/docs", (req, res) => {
    res.json({
        title: "Claude Chat API Documentation",
        version: "1.0.0",
        endpoints: [
            {
                method: "POST",
                path: "/api/chat",
                description: "Send message to AI and get response",
                body: {
                    message: "string (required, max 2000 chars)",
                    aiModel: "string (optional, default: 'Gemini')",
                    chatId: "string (optional, for existing chat)"
                },
                response: {
                    success: "boolean",
                    message: "string (AI response)",
                    model: "string",
                    timestamp: "ISO string",
                    chatId: "string"
                }
            },
            {
                method: "GET",
                path: "/health",
                description: "Check server health status"
            },
            {
                method: "GET",
                path: "/api/chats",
                description: "Get list of all chats"
            },
            {
                method: "GET",
                path: "/api/chat/:id",
                description: "Get specific chat by ID"
            },
            {
                method: "DELETE",
                path: "/api/chat/:id",
                description: "Delete a specific chat by ID",
                response: {
                    success: "boolean",
                    message: "string",
                    timestamp: "ISO string"
                }
            }
        ]
    })
})

app.use((err, req, res, next) => {
    console.error('🚨 Unhandled error:', err.stack)
    res.status(500).json({
        success: false,
        error: 'Something went wrong!',
        timestamp: new Date().toISOString(),
        requestId: Math.random().toString(36).substring(7)
    })
})

app.use((req, res) => {
    console.log(`❓ 404 - Route not found: ${req.method} ${req.path}`)
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        requestedPath: req.path,
        availableEndpoints: [
            'POST /api/chat',
            'POST /prompt', 
            'GET /health', 
            'GET /api/status',
            'GET /api/docs',
            'GET /api/chats',
            'GET /api/chat/:id',
            'DELETE /api/chat/:id',
            'GET /'
        ],
        timestamp: new Date().toISOString()
    })
})

const PORT = process.env.PORT || 3000

app.listen(PORT, async () => {
    await initializeChatsFile()
    console.log('\n🚀 Server successfully started!')
    console.log(`📱 Frontend: http://localhost:${PORT}`)
    console.log(`🔍 Health check: http://localhost:${PORT}/health`)
    console.log(`📊 API status: http://localhost:${PORT}/api/status`)
    console.log(`📚 API docs: http://localhost:${PORT}/api/docs`)
    console.log(`💬 Chat API: POST http://localhost:${PORT}/api/chat`)
    console.log(`⏰ Server time: ${new Date().toLocaleString()}`)
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`)
    console.log('─'.repeat(50))
})