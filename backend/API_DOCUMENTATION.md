# 📡 API Documentation — Fraud Detection System

> **Base URL**: `http://localhost:5000`  
> **Version**: 1.0.0  
> **Content-Type**: `application/json`

---

## 📋 Table of Contents

| # | Method | Endpoint | Description | Auth |
|---|--------|----------|-------------|:----:|
| 1 | `POST` | `/api/auth/register` | Register a new user | ✗ |
| 2 | `POST` | `/api/auth/login` | Login & get tokens | ✗ |
| 3 | `GET` | `/api/auth/profile` | Get logged-in user profile | ✔ |
| 4 | `PUT` | `/api/auth/profile` | Update user profile | ✔ |
| 5 | `POST` | `/api/auth/refresh-token` | Refresh access token | ✗ |
| 6 | `POST` | `/api/auth/logout` | Logout & invalidate refresh token | ✔ |
| 7 | `POST` | `/api/auth/change-password` | Change user password | ✔ |

---

## 🔑 Authentication

Protected endpoints require a **Bearer token** in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

---

## 📌 Health Check

### `GET /`

Returns server status.

**Response** `200 OK`
```json
{
  "success": true,
  "message": "🛡️ Fraud Detection API is running",
  "version": "1.0.0",
  "timestamp": "2024-09-01T10:00:00.000Z"
}
```

---

## 1️⃣ Register User

### `POST /api/auth/register`

Create a new user account.

**Request Body**
```json
{
  "name": "Bharath Kumar",
  "email": "bharath@example.com",
  "phone": "+919876543210",
  "password": "Secure123"
}
```

| Field | Type | Required | Rules |
|-------|------|:--------:|-------|
| `name` | string | ✔ | 2–50 characters |
| `email` | string | ✔ | Valid email format, unique |
| `phone` | string | ✔ | Valid phone (e.g. `+919876543210`) |
| `password` | string | ✔ | Min 6 chars, must contain a number |

**Success Response** `201 Created`
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "name": "Bharath Kumar",
      "email": "bharath@example.com",
      "phone": "+919876543210",
      "role": "user",
      "isVerified": false,
      "createdAt": "2024-09-01T10:00:00.000Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Error Responses**

| Status | Message |
|--------|---------|
| `400` | Validation failed (see `errors` array) |
| `400` | User with this email already exists |

---

## 2️⃣ Login User

### `POST /api/auth/login`

Authenticate a user and receive token pair.

**Request Body**
```json
{
  "email": "bharath@example.com",
  "password": "Secure123"
}
```

| Field | Type | Required |
|-------|------|:--------:|
| `email` | string | ✔ |
| `password` | string | ✔ |

**Success Response** `200 OK`
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "name": "Bharath Kumar",
      "email": "bharath@example.com",
      "phone": "+919876543210",
      "role": "user",
      "isVerified": false
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Error Responses**

| Status | Message |
|--------|---------|
| `400` | Validation failed |
| `401` | Invalid email or password |

---

## 3️⃣ Get User Profile

### `GET /api/auth/profile`

Retrieve the authenticated user's profile.

**Headers**
```
Authorization: Bearer <access_token>
```

**Success Response** `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "name": "Bharath Kumar",
    "email": "bharath@example.com",
    "phone": "+919876543210",
    "role": "user",
    "isVerified": false,
    "createdAt": "2024-09-01T10:00:00.000Z",
    "updatedAt": "2024-09-01T10:00:00.000Z"
  }
}
```

**Error Responses**

| Status | Message |
|--------|---------|
| `401` | Not authorized — no token provided |
| `401` | Not authorized — token invalid or expired |
| `404` | User not found |

---

## 4️⃣ Update User Profile

### `PUT /api/auth/profile`

Update the authenticated user's name and/or phone number.

**Headers**
```
Authorization: Bearer <access_token>
```

**Request Body** (all fields optional)
```json
{
  "name": "Bharath K",
  "phone": "+919876543211"
}
```

| Field | Type | Required | Rules |
|-------|------|:--------:|-------|
| `name` | string | ✗ | 2–50 characters |
| `phone` | string | ✗ | Valid phone number |

**Success Response** `200 OK`
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "name": "Bharath K",
    "email": "bharath@example.com",
    "phone": "+919876543211",
    "role": "user",
    "isVerified": false,
    "updatedAt": "2024-09-01T12:00:00.000Z"
  }
}
```

**Error Responses**

| Status | Message |
|--------|---------|
| `400` | Validation failed |
| `401` | Not authorized |
| `404` | User not found |

---

## 5️⃣ Refresh Access Token

### `POST /api/auth/refresh-token`

Exchange a valid refresh token for a new access + refresh token pair (token rotation).

**Request Body**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

| Field | Type | Required |
|-------|------|:--------:|
| `refreshToken` | string | ✔ |

**Success Response** `200 OK`
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Error Responses**

| Status | Message |
|--------|---------|
| `400` | Validation failed |
| `401` | Invalid or expired refresh token |
| `401` | Invalid refresh token — please login again |

---

## 6️⃣ Logout

### `POST /api/auth/logout`

Invalidate the user's refresh token (server-side logout).

**Headers**
```
Authorization: Bearer <access_token>
```

**Success Response** `200 OK`
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**Error Responses**

| Status | Message |
|--------|---------|
| `401` | Not authorized |

---

## 7️⃣ Change Password

### `POST /api/auth/change-password`

Change the authenticated user's password. Returns new tokens after password change.

**Headers**
```
Authorization: Bearer <access_token>
```

**Request Body**
```json
{
  "currentPassword": "Secure123",
  "newPassword": "NewSecure456"
}
```

| Field | Type | Required | Rules |
|-------|------|:--------:|-------|
| `currentPassword` | string | ✔ | — |
| `newPassword` | string | ✔ | Min 6 chars, must contain a number |

**Success Response** `200 OK`
```json
{
  "success": true,
  "message": "Password changed successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Error Responses**

| Status | Message |
|--------|---------|
| `400` | Validation failed |
| `401` | Current password is incorrect |
| `401` | Not authorized |

---

## 7️⃣ Conversational AI Security Assistant

### `POST /api/assistant/chat`

Handles conversational AI requests for:
1. **Explain This Detection** — Translates machine learning and rule-based detector outputs into plain language.
2. **Fraud Help & Recovery** — Incident triage for clicking links, sharing OTPs, or transferring money, with priority escalation to the National Cybercrime Helpline **1930** and [cybercrime.gov.in](https://cybercrime.gov.in/).

**Request Body**
```json
{
  "message": "Why is this link suspicious?",
  "mode": "detection_explanation",
  "conversationId": "conv_12345",
  "detectionContext": {
    "detectionId": "rec_001",
    "source": "SMS",
    "classification": "FRAUD",
    "riskScore": 0.92,
    "reasons": ["Suspicious URL detected", "Urgent deadline keyword"],
    "safePreview": "URGENT: Your bank account will be blocked..."
  },
  "history": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "How can I help you today?" }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `message` | string | ✓ | User message (1–2000 characters) |
| `mode` | string | ✗ | `detection_explanation` or `general_help` (default: `general_help`) |
| `conversationId` | string | ✗ | Stable session identifier |
| `detectionContext` | object | ✗ | Minimal validated detector context |
| `history` | array | ✗ | Up to 20 recent conversation turns |

**Success Response** `200 OK`
```json
{
  "success": true,
  "conversationId": "conv_12345",
  "mode": "detection_explanation",
  "response": "This message was flagged with a 92% risk score because...",
  "suggestedFollowUps": [
    "What should I do next?",
    "Could this be a real bank message?"
  ],
  "actionChecklist": [
    "Do not click the link or download attachments",
    "Block and report the sender"
  ],
  "urgency": "medium"
}
```

---

## ⚠️ Common Error Response Format

All error responses follow this structure:

```json
{
  "success": false,
  "message": "Description of the error"
}
```

For validation errors, an additional `errors` array is included:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Please enter a valid email"
    }
  ]
}
```

---

## 🚀 Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env
# Edit .env with your MongoDB URI and JWT secrets

# 3. Start the server
npm run dev    # Development (with auto-reload)
npm start      # Production
```

> **Note**: Make sure MongoDB is running locally or update `MONGO_URI` in `.env` to point to your MongoDB Atlas cluster.
