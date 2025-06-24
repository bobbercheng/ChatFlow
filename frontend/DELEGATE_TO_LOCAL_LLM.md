# Idea
The idea is has frontend reply message with local LLM e.g. LM Studio.

# UI and workflow
Introduce a slide switcher "Delegate to local LLM" next to Conversation ID textbox. If it's on, it will send all conversation messages to local LLM with OpenAI library to generate new text message once it get new messages from others, and send generated text message to the conversation.

# How to generate text message

If frontend message array is 
```
[
    {
        "id": "msg_1750650773913_f8pyjydjv",
        "conversationId": "conv_1750602947952_ooi4lpapu",
        "senderId": "user2@example.com",
        "senderDisplayName": "Rohit",
        "messageType": "TEXT",
        "content": "ready for LLM?",
        "createdAt": "2025-06-23T03:52:53.913Z",
        "updatedAt": "2025-06-23T03:52:53.913Z",
        "sender": {
            "email": "user2@example.com",
            "displayName": "Rohit"
        },
        "cssClass": "message message-received",
        "formattedTime": "11:52 PM"
    },
    {
        "id": "msg_1750646196365_kucqca22b",
        "conversationId": "conv_1750602947952_ooi4lpapu",
        "senderId": "bobbercheng@hotmail.com",
        "senderDisplayName": "Bobber Cheng",
        "messageType": "TEXT",
        "content": "Let check search suggestion click again",
        "createdAt": "2025-06-23T02:36:36.373Z",
        "updatedAt": {
            "_seconds": 1750646196,
            "_nanoseconds": 373000000
        },
        "sender": {
            "email": "bobbercheng@hotmail.com",
            "displayName": "Bobber Cheng"
        },
        "cssClass": "message message-sent",
        "formattedTime": "10:36 PM"
    },
    {
        "id": "msg_1750645612499_mxjscniof",
        "conversationId": "conv_1750602947952_ooi4lpapu",
        "senderId": "bobbercheng@hotmail.com",
        "senderDisplayName": "Bobber Cheng",
        "messageType": "TEXT",
        "content": "Let's check security of search",
        "createdAt": "2025-06-23T02:26:52.517Z",
        "updatedAt": {
            "_seconds": 1750645612,
            "_nanoseconds": 517000000
        },
        "sender": {
            "email": "bobbercheng@hotmail.com",
            "displayName": "Bobber Cheng"
        },
        "cssClass": "message message-sent",
        "formattedTime": "10:26 PM"
    },
    {
        "id": "msg_1750642707746_vj16s7zs1",
        "conversationId": "conv_1750602947952_ooi4lpapu",
        "senderId": "bobbercheng@hotmail.com",
        "senderDisplayName": "Bobber Cheng",
        "messageType": "TEXT",
        "content": "Yeah, we both confirm it and nobody can spy us.",
        "createdAt": "2025-06-23T01:38:27.753Z",
        "updatedAt": {
            "_seconds": 1750642707,
            "_nanoseconds": 753000000
        },
        "sender": {
            "email": "bobbercheng@hotmail.com",
            "displayName": "Bobber Cheng"
        },
        "cssClass": "message message-sent",
        "formattedTime": "09:38 PM"
    },
    {
        "id": "msg_1750642685401_1aw0fb0kg",
        "conversationId": "conv_1750602947952_ooi4lpapu",
        "senderId": "bobbercheng@hotmail.com",
        "senderDisplayName": "Bobber Cheng",
        "messageType": "TEXT",
        "content": "I got same as well.",
        "createdAt": "2025-06-23T01:38:05.407Z",
        "updatedAt": {
            "_seconds": 1750642685,
            "_nanoseconds": 407000000
        },
        "sender": {
            "email": "bobbercheng@hotmail.com",
            "displayName": "Bobber Cheng"
        },
        "cssClass": "message message-sent",
        "formattedTime": "09:38 PM"
    },
    {
        "id": "msg_1750642655121_gqdbcsrsw",
        "conversationId": "conv_1750602947952_ooi4lpapu",
        "senderId": "user2@example.com",
        "senderDisplayName": "Rohit",
        "messageType": "TEXT",
        "content": "from my console log, I can see 🔓 [DECRYPTION DEBUG] Decryption successful: {resultLength: 35, preview: \"Let's test encrypted messages again\"}. I think I got encrypted message.",
        "createdAt": "2025-06-23T01:37:35.133Z",
        "updatedAt": {
            "_seconds": 1750642655,
            "_nanoseconds": 133000000
        },
        "sender": {
            "email": "user2@example.com",
            "displayName": "Rohit"
        },
        "cssClass": "message message-received",
        "formattedTime": "09:37 PM"
    }
]
```

The message to LLM should be

```
{
    "model": "qwen3-4b",
    "messages": [
      { "role": "system", "content": "You are sender bobbercheng@hotmail.com in a conversation. Here is all conversation messages in JSON array you get so far. Please reply it just in text message for content you send to the conversation." },
      { "role": "user", "content": string format of messages array }
    ],
    "temperature": 0.7,
    "max_tokens": -1,
    "stream": false
}
```

## Implement suggestion

Please use a industry-standard template based method to generate LLM message with variants like messages and javascript built-in methods like JSON.stringify() like eval() without security concern. The template may like:
```
{
    "model": "qwen3-4b",
    "messages": [
      { "role": "system", "content": "You are sender ${this.currentUser.email} in a conversation. Here is all conversation messages in JSON array you get so far. Please reply it just in text message for content you send to the conversation." },
      { "role": "user", "content": ${JSON.stringify(this.messages)} }
    ],
    "temperature": 0.7,
    "max_tokens": -1,
    "stream": false
}
```
Local LLM base URL for chat completions is http://127.0.0.1:1234/v1.