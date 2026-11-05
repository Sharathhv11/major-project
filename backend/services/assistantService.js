/**
 * Conversational Assistant Service — FraudShield
 *
 * Implements context-aware conversational AI for:
 * 1. Detection Explanation — explains existing ML/rule detector findings without technical jargon
 * 2. Website Permission Protection — explains risks, valid use cases, and revocation guides for Camera, Mic, and Location
 * 3. Guided Scam Recovery — prioritizes immediate safety actions (Helpline 1930 / cybercrime.gov.in)
 * 4. General Cybersecurity & Conversational Queries — answers questions on digital safety, greetings, and common threats
 *
 * Architecture:
 * - Keeps all credentials strictly on the backend (never exposed to client).
 * - Multi-provider LLM support: Google Gemini API (GEMINI_API_KEY) and OpenAI/compatible (OPENAI_API_KEY / LLM_API_KEY).
 * - Comprehensive domain-expert reasoning engine that operates seamlessly offline or when external provider is unavailable.
 * - Adheres strictly to Indian cybercrime helpline (1930 / cybercrime.gov.in) and safety guardrails.
 */

// ─── Constants & Configuration ──────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

const LLM_API_KEY = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "";
const LLM_MODEL = process.env.LLM_MODEL || "gpt-4o-mini";
const LLM_API_URL = process.env.LLM_API_URL || "https://api.openai.com/v1/chat/completions";

const REQUEST_TIMEOUT_MS = 10000;

const HELPLINE_INFO = {
  phone: "1930",
  portal: "https://cybercrime.gov.in/",
  country: "India National Cyber Crime Reporting Portal",
};

/**
 * Validates and normalizes detection context passed from existing detector or permission monitor.
 */
function validateDetectionContext(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const detectionId = typeof raw.detectionId === "string" ? raw.detectionId.trim().substring(0, 100) : undefined;
  const source = typeof raw.source === "string" ? raw.source.trim().substring(0, 50) : "UNKNOWN";
  const classification = typeof raw.classification === "string" ? raw.classification.trim().substring(0, 50) : "UNKNOWN";
  
  let riskScore = 0;
  if (typeof raw.riskScore === "number" && !isNaN(raw.riskScore)) {
    riskScore = Math.max(0, Math.min(1, raw.riskScore));
  }

  const reasons = Array.isArray(raw.reasons)
    ? raw.reasons.filter((r) => typeof r === "string").map((r) => r.trim().substring(0, 150)).slice(0, 10)
    : [];

  const safePreview = typeof raw.safePreview === "string" ? raw.safePreview.trim().substring(0, 200) : "";

  // Website permission context fields
  const permissionType = typeof raw.permissionType === "string" ? raw.permissionType.trim().toLowerCase() : undefined;
  const domain = typeof raw.domain === "string" ? raw.domain.trim().substring(0, 100) : undefined;
  const trustLevel = typeof raw.trustLevel === "string" ? raw.trustLevel.trim().toUpperCase() : undefined;
  const browser = typeof raw.browser === "string" ? raw.browser.trim().substring(0, 50) : undefined;

  return {
    detectionId,
    source,
    classification,
    riskScore,
    reasons,
    safePreview,
    permissionType,
    domain,
    trustLevel,
    browser,
  };
}

/**
 * Checks if user message mentions or appears to contain sensitive secrets like OTP or passwords.
 */
function detectSecretsInInput(text) {
  if (!text || typeof text !== "string") return false;
  const otpPattern = /\b\d{4,8}\b/;
  const passwordMention = /(password|pin|cvv|otp|passcode)\s*(is|=|:)\s*\S+/i;
  return otpPattern.test(text) && passwordMention.test(text);
}

// ─── Domain-Expert Fallback / Reasoning Engine ──────────────────────────────

/**
 * Generates an empathetic, fact-based response for explaining website permission requests.
 */
function generateWebsitePermissionExplanation(context, userMessage) {
  const perm = (context.permissionType || "").toLowerCase();
  const domain = context.domain || "the website";
  const trust = context.trustLevel || "UNKNOWN";
  const msgLower = (userMessage || "").toLowerCase();

  // If user asks how to revoke/turn off in Chrome or Android
  if (
    msgLower.includes("how to revoke") ||
    msgLower.includes("turn off") ||
    msgLower.includes("block") ||
    msgLower.includes("chrome") ||
    msgLower.includes("settings") ||
    msgLower.includes("how do i do that")
  ) {
    return {
      response:
        `Here is how to manage or revoke permissions for ${domain}:\n\n` +
        `🌐 In Google Chrome:\n` +
        `1. While viewing ${domain}, tap the 🔒 lock or tune icon in the address bar.\n` +
        `2. Tap "Permissions" and toggle off Camera, Microphone, or Location.\n` +
        `3. Alternatively, tap the 3 dots (⋮) in Chrome → Settings → Site settings → select the permission (e.g. Camera) → tap ${domain} → "Remove" or "Reset".\n\n` +
        `📱 In Android System Settings:\n` +
        `1. Open Android Settings → Apps → Chrome (or your browser).\n` +
        `2. Tap "Permissions".\n` +
        `3. Select the permission and change it to "Don't allow" or "Ask every time".`,
      suggestedFollowUps: [
        "Can a website record me when the browser is closed?",
        "Why did this website need this permission?",
        "What are the risks of granting camera access?",
      ],
      actionChecklist: [
        `Tap the lock icon in Chrome address bar to manage permissions for ${domain}`,
        "Set sensitive permissions to 'Ask every time' instead of 'Always allow'",
        "Check Android Settings → Apps → Chrome → Permissions",
      ],
      urgency: "low",
    };
  }

  // Camera Permission
  if (perm.includes("camera") || perm.includes("video")) {
    const isSuspicious = trust === "SUSPICIOUS";
    return {
      response:
        `Security Assessment for Camera Request from ${domain}:\n\n` +
        `• Permission Requested: Device Camera (video and photos)\n` +
        `• Website Trust Status: ${trust === "VERIFIED" ? "Verified / Safe" : trust === "SUSPICIOUS" ? "Suspicious / High Risk" : "Unknown / Unverified"}\n\n` +
        `🔍 Potential Risks:\n` +
        `When a website gains camera permission, it can stream or capture video whenever that webpage is open in your browser. Malicious sites can use this for unconsented photo capture, facial profiling, or identity theft.\n\n` +
        `✅ Legitimate Use Cases:\n` +
        `Legitimate platforms typically only ask for camera access for video conferencing (e.g., Google Meet, Zoom), bank KYC identity verification, scanning QR codes, or uploading profile photos.\n\n` +
        `💡 Recommendation:\n` +
        (isSuspicious
          ? `We strongly advise DENYING camera access to ${domain} as it exhibits suspicious risk factors.`
          : `If you did not initiate a feature requiring video (such as a call or ID photo), tap DENY. You can always grant it later if truly needed.`),
      suggestedFollowUps: [
        `How do I revoke camera permission for ${domain}?`,
        "Can a website turn on my camera secretly in background?",
        "What should I do if I accidentally allowed camera access?",
      ],
      actionChecklist: [
        `Only allow camera access if you initiated a video call or KYC verification`,
        `Tap Deny if ${domain} is a shopping, reading, or unfamiliar site`,
        `Revoke access via Chrome's lock icon whenever you are finished`,
      ],
      urgency: isSuspicious ? "high" : "medium",
    };
  }

  // Microphone Permission
  if (perm.includes("mic") || perm.includes("audio")) {
    const isSuspicious = trust === "SUSPICIOUS";
    return {
      response:
        `Security Assessment for Microphone Request from ${domain}:\n\n` +
        `• Permission Requested: Device Microphone (audio recording)\n` +
        `• Website Trust Status: ${trust === "VERIFIED" ? "Verified / Safe" : trust === "SUSPICIOUS" ? "Suspicious / High Risk" : "Unknown / Unverified"}\n\n` +
        `🔍 Potential Risks:\n` +
        `Microphone access allows a website to listen to audio and record room conversations while the browser tab remains active. Deceptive sites can harvest ambient audio, private discussions, or voice biometric data.\n\n` +
        `✅ Legitimate Use Cases:\n` +
        `Audio permissions are standard for voice/video calls, customer service voice chat, speech-to-text dictation, and voice search.\n\n` +
        `💡 Recommendation:\n` +
        (isSuspicious
          ? `DENY microphone access for ${domain}. There is no validated justification for this site to access your microphone.`
          : `Unless you explicitly tapped a microphone icon to record audio or speak, tap DENY.`),
      suggestedFollowUps: [
        `How do I revoke microphone permission for ${domain}?`,
        "Can a website record audio when my phone is locked?",
        "How do I see all websites with microphone access in Chrome?",
      ],
      actionChecklist: [
        `Deny microphone permission unless participating in a voice call`,
        `Close the browser tab when finished with voice interactions`,
        `Check Chrome Settings → Site Settings → Microphone`,
      ],
      urgency: isSuspicious ? "high" : "medium",
    };
  }

  // Location Permission (Precise or Approximate)
  if (perm.includes("location") || perm.includes("gps")) {
    const isSuspicious = trust === "SUSPICIOUS";
    return {
      response:
        `Security Assessment for Location Request from ${domain}:\n\n` +
        `• Permission Requested: Geographic Location (GPS / Network Coordinates)\n` +
        `• Website Trust Status: ${trust === "VERIFIED" ? "Verified / Safe" : trust === "SUSPICIOUS" ? "Suspicious / High Risk" : "Unknown / Unverified"}\n\n` +
        `🔍 Potential Risks:\n` +
        `Precise location sharing reveals your exact physical coordinates, which can be correlated to reveal your home address, workplace, and daily routines. Unscrupulous websites share or sell this data to ad-tracking networks.\n\n` +
        `✅ Legitimate Use Cases:\n` +
        `Navigation mapping, food/grocery delivery dispatch, finding nearby physical bank branches or ATM kiosks, and localized emergency services.\n\n` +
        `💡 Recommendation:\n` +
        (isSuspicious
          ? `DENY location access. ${domain} does not have a verified need to track your physical whereabouts.`
          : `If the site does not require your location for immediate delivery or local search, tap DENY.`),
      suggestedFollowUps: [
        `How do I revoke location permission for ${domain}?`,
        "What is the difference between precise and approximate location?",
        "Can websites track my location without permission?",
      ],
      actionChecklist: [
        `Deny location permission unless using maps or active delivery services`,
        `Prefer entering your PIN code or city manually instead of sharing GPS`,
        `Check Chrome Settings → Site Settings → Location to review sites`,
      ],
      urgency: isSuspicious ? "high" : "medium",
    };
  }

  // Generic website permission fallback
  return {
    response:
      `Security Assessment for Permission Request from ${domain}:\n\n` +
      `The website is requesting access to device hardware or sensitive sensors. Always consider:\n` +
      `1. Does this website actually require this feature to provide its service?\n` +
      `2. Do you trust the organization operating ${domain}?\n` +
      `3. When in doubt, always choose DENY. If a legitimate feature fails to work, you can grant permission selectively.`,
    suggestedFollowUps: [
      `How do I manage site permissions in Chrome?`,
      "What are the safest browser permission settings?",
      "Can websites access permissions without prompting?",
    ],
    actionChecklist: [
      `Tap Deny if the permission is unnecessary for the site's function`,
      `Review granted permissions regularly in your browser settings`,
    ],
    urgency: "low",
  };
}

/**
 * Generates an empathetic, fact-based response for explaining a detection.
 */
function generateDetectionExplanation(context, userMessage) {
  // If context is a website permission request
  if (context.permissionType) {
    return generateWebsitePermissionExplanation(context, userMessage);
  }

  const isHighRisk = context.classification === "FRAUD" || context.riskScore >= 0.70;
  const riskPct = Math.round(context.riskScore * 100);
  const msgLower = (userMessage || "").toLowerCase();

  // If follow-up question
  if (msgLower.includes("why is this link") || msgLower.includes("suspicious link")) {
    return {
      response:
        "The link was flagged because it exhibits patterns frequently observed in phishing attacks—such as using an insecure HTTP protocol, excessive redirection, an IP-based address, or mimicry of an authentic brand domain. We strongly recommend NOT clicking or opening this URL. If you need to access this service, navigate to its official website directly through your browser.",
      suggestedFollowUps: [
        "What should I do with this message?",
        "Could this be a genuine bank message?",
        "How can I report this sender?",
      ],
      actionChecklist: [
        "Do not click the link or download attachments",
        "Block and report the sender inside your messaging app",
        "Delete the message to prevent accidental clicks",
      ],
      urgency: "medium",
    };
  }

  if (msgLower.includes("genuine bank") || msgLower.includes("real bank") || msgLower.includes("is this real")) {
    return {
      response:
        "Legitimate banks and financial institutions will NEVER ask you to verify accounts via suspicious links, nor will they threaten immediate account closure over SMS or WhatsApp. They also will never request your OTP, UPI PIN, or password. If you are uncertain, open your bank's official mobile banking app or call the verified helpline number printed on the back of your debit/credit card.",
      suggestedFollowUps: [
        "Why was this message flagged?",
        "I already clicked the link, what should I do?",
        "How do scammers obtain my number?",
      ],
      actionChecklist: [
        "Verify your account status via your official banking app",
        "Do not reply to the sender or share verification codes",
        "Never call phone numbers provided inside the suspicious message",
      ],
      urgency: "medium",
    };
  }

  // Primary explanation
  let evidenceSummary = "";
  if (context.reasons && context.reasons.length > 0) {
    evidenceSummary = "Specific indicators identified include:\n• " + context.reasons.join("\n• ");
  } else if (isHighRisk) {
    evidenceSummary = "The message exhibits strong linguistic characteristics and pressure tactics typical of phishing campaigns.";
  } else {
    evidenceSummary = "No definitive scam indicators were detected, but always exercise caution with unsolicited messages.";
  }

  const responseText = isHighRisk
    ? `FraudShield flagged this ${context.source} message as potential fraud (estimated risk: ${riskPct}%).\n\n${evidenceSummary}\n\nThis warning indicates that the content matches known scam tactics (such as urgency, account suspension claims, or unverified links). Remember that this is a risk assessment—always independently verify unexpected requests before taking action.`
    : `FraudShield did not identify high-risk scam indicators in this ${context.source} message (estimated risk: ${riskPct}%).\n\nHowever, this is a risk assessment, not absolute proof of safety. If this message involves unexpected financial requests, refunds, or identity queries, verify the sender independently.`;

  return {
    response: responseText,
    suggestedFollowUps: [
      "Why is this link suspicious?",
      "Could this be a genuine bank alert?",
      "What should I do next?",
    ],
    actionChecklist: isHighRisk
      ? [
          "Avoid clicking any embedded links or phone numbers",
          "Never share OTPs, PINs, or credentials",
          "Verify through the official organization app or website",
        ]
      : [
          "Verify unexpected payment requests through official channels",
          "Ensure the sender is someone you know or expect",
        ],
    urgency: isHighRisk ? "high" : "low",
  };
}

/**
 * Generates structured recovery steps based on user's reported incident or general query.
 */
function generateGuidedRecovery(userMessage) {
  const msgLower = (userMessage || "").toLowerCase();

  // 1. Money Transferred / Financial Loss
  if (
    msgLower.includes("sent money") ||
    msgLower.includes("transferred") ||
    msgLower.includes("paid") ||
    msgLower.includes("lost money") ||
    msgLower.includes("scammed money")
  ) {
    return {
      response:
        "Please act quickly—every minute matters for financial fraud:\n\n" +
        "1. Immediately call your bank or UPI/payment app customer care to freeze the transaction and report unauthorized debit.\n" +
        `2. For incidents in India, call the National Cyber Crime Helpline at ${HELPLINE_INFO.phone} immediately or register a complaint at ${HELPLINE_INFO.portal}.\n` +
        "3. Preserve all transaction IDs, timestamps, payment screenshots, and scammer phone numbers/UPI IDs as evidence.\n\n" +
        "Important: Never pay 'recovery agents' or third parties claiming they can retrieve lost funds—they are almost always secondary scams. Recovery must be handled exclusively through your bank and law enforcement.",
      suggestedFollowUps: [
        "What evidence do I need for the cybercrime report?",
        "Should I block my debit/credit card too?",
        "Can the bank reverse a UPI transfer?",
      ],
      actionChecklist: [
        "Call bank customer care immediately to freeze transaction",
        `Dial ${HELPLINE_INFO.phone} (National Cyber Crime Helpline)`,
        `File an official complaint at ${HELPLINE_INFO.portal}`,
        "Save payment screenshot, transaction ID, and timestamp",
      ],
      urgency: "immediate",
    };
  }

  // 2. Credentials or OTP shared
  if (
    msgLower.includes("otp") ||
    msgLower.includes("password") ||
    msgLower.includes("pin") ||
    msgLower.includes("shared") ||
    msgLower.includes("credential")
  ) {
    return {
      response:
        "If you shared an OTP, PIN, or password, prioritize securing your accounts immediately:\n\n" +
        "1. If financial credentials (banking, UPI, card PIN, or bank OTP) were shared, contact your bank immediately to block your card/net banking and freeze unauthorized activity.\n" +
        "2. If you shared an account password (email, social media), immediately change the password on the official website from a secure device.\n" +
        "3. Use 'Log out of all devices' or 'Revoke active sessions' in that service's security settings.\n" +
        "4. Enable Two-Factor Authentication (2FA) using an authenticator app.\n\n" +
        "Remember: Legitimate institutions will NEVER ask you to reveal an OTP.",
      suggestedFollowUps: [
        "How do I log out of other devices?",
        "What if they changed my password already?",
        "Could my email be compromised too?",
      ],
      actionChecklist: [
        "Call your bank immediately if financial access was shared",
        "Change your password on the genuine official website",
        "Select 'Log out of all devices' in security settings",
        "Enable Two-Factor Authentication (2FA)",
      ],
      urgency: "immediate",
    };
  }

  // 3. Suspicious Link Clicked
  if (
    msgLower.includes("clicked a link") ||
    msgLower.includes("clicked link") ||
    msgLower.includes("opened link") ||
    msgLower.includes("clicked")
  ) {
    return {
      response:
        "Clicking a link by itself does not automatically compromise your phone or bank account, provided you did not share credentials or install software. Let's triage what happened:\n\n" +
        "• Did you enter any usernames, passwords, card numbers, or OTPs on the webpage?\n" +
        "• Did a file or application automatically download or ask to be installed?\n" +
        "• Did you approve any screen-sharing or accessibility permissions?\n\n" +
        "If you only opened the page and immediately closed the tab without entering information or downloading anything, your risk is generally very low. Clear your browser cookies and history for added safety.",
      suggestedFollowUps: [
        "I entered my phone number and password.",
        "A file downloaded to my phone.",
        "I only closed the browser tab immediately.",
      ],
      actionChecklist: [
        "Close the browser tab immediately",
        "Clear browser cache and recent browsing data",
        "Check your Downloads folder and delete any downloaded files",
        "Do not enter passwords if the webpage opens again",
      ],
      urgency: "medium",
    };
  }

  // 4. Suspicious App Installed
  if (
    msgLower.includes("installed") ||
    msgLower.includes("downloaded app") ||
    msgLower.includes("apk") ||
    msgLower.includes("anydesk") ||
    msgLower.includes("teamviewer") ||
    msgLower.includes("rustdesk")
  ) {
    return {
      response:
        "Remote-access or unknown APK apps pose significant risks because they can inspect your screen or intercept incoming OTPs:\n\n" +
        "1. Disconnect your phone from Wi-Fi and mobile data immediately (turn on Airplane mode).\n" +
        "2. Go to Android Settings → Apps → Locate the suspicious application → Tap 'Force Stop' and 'Uninstall'.\n" +
        "3. Check Android Settings → Accessibility to ensure no suspicious service has screen monitoring privileges.\n" +
        "4. From a separate, trusted device, check your bank and primary email accounts to verify no unauthorized logins occurred.",
      suggestedFollowUps: [
        "The app won't let me uninstall it.",
        "Could the app read my SMS OTPs?",
        "Should I factory reset my phone?",
      ],
      actionChecklist: [
        "Turn on Airplane mode / disconnect internet",
        "Uninstall the suspicious app via Android Settings → Apps",
        "Revoke unknown services in Android Settings → Accessibility",
        "Check banking activity from a different, safe device",
      ],
      urgency: "high",
    };
  }

  // 5. How to Report a Scam / General Safety Check
  if (msgLower.includes("report") || msgLower.includes("helpline") || msgLower.includes("cybercrime")) {
    return {
      response:
        `To report online financial fraud or cybercrime in India:\n\n` +
        `• Call the National Cyber Crime Helpline: ${HELPLINE_INFO.phone} (Available 24/7)\n` +
        `• Submit an incident report online: ${HELPLINE_INFO.portal}\n` +
        `• For WhatsApp/SMS scams: Use the in-app 'Report & Block' button\n` +
        `• For UPI/Bank fraud: Report directly through your payment app and file a formal dispute with your bank.\n\n` +
        `Keep transaction reference IDs, sender numbers, message screenshots, and call logs ready when filing the complaint.`,
      suggestedFollowUps: [
        "What documents are needed for cybercrime complaint?",
        "How do I report a fraudulent UPI handle?",
        "How can FraudShield protect my messages?",
      ],
      actionChecklist: [
        `Call ${HELPLINE_INFO.phone} for immediate financial fraud intervention`,
        `File an e-complaint at ${HELPLINE_INFO.portal}`,
        "Gather screenshots, sender IDs, and transaction details",
      ],
      urgency: "low",
    };
  }

  // 6. Website Permission General Questions
  if (
    msgLower.includes("camera permission") ||
    msgLower.includes("microphone permission") ||
    msgLower.includes("location permission") ||
    msgLower.includes("website permission") ||
    msgLower.includes("chrome permission")
  ) {
    return {
      response:
        "Websites in modern browsers (like Google Chrome, Samsung Internet, and Edge) frequently request access to your device's Camera, Microphone, or Location:\n\n" +
        "• Camera: Allows capturing video or photos (safe for video calls or KYC; risky on unknown sites).\n" +
        "• Microphone: Allows listening to audio (safe for voice search and calls; risky for ambient eavesdropping).\n" +
        "• Location: Pinpoints GPS coordinates (safe for navigation and delivery; risky for user profiling).\n\n" +
        "To revoke any permission in Chrome: tap the lock or tune icon in the address bar → Permissions → Reset.",
      suggestedFollowUps: [
        "How do I revoke permissions in Chrome?",
        "Why would a shopping site ask for camera?",
        "Can a website access camera without asking?",
      ],
      actionChecklist: [
        "Review Chrome Settings → Site Settings to audit permissions",
        "Set permissions to 'Ask every time' instead of 'Allow'",
      ],
      urgency: "low",
    };
  }

  // 7. General Cybersecurity Concept Questions
  if (
    msgLower.includes("what is phishing") ||
    msgLower.includes("what is 2fa") ||
    msgLower.includes("two factor") ||
    msgLower.includes("https") ||
    msgLower.includes("vpn") ||
    msgLower.includes("ip address")
  ) {
    return {
      response:
        "Here is a quick overview of essential cybersecurity concepts:\n\n" +
        "• Phishing: Deceptive messages or fake websites crafted to impersonate trusted brands (like banks or courier services) to trick you into entering credentials or sending money.\n" +
        "• HTTPS: Secure, encrypted web communication. Unencrypted HTTP allows attackers on the same network to intercept passwords and messages in plain text.\n" +
        "• Two-Factor Authentication (2FA): An extra layer of security beyond your password (e.g., authenticator apps). Even if someone steals your password, they cannot log in without the secondary code.",
      suggestedFollowUps: [
        "How can I tell if a website is HTTPS?",
        "Why is an authenticator app better than SMS OTP?",
        "What should I do if I suspect phishing?",
      ],
      actionChecklist: [
        "Always check that URLs start with https:// and have a lock icon",
        "Enable 2FA on your email and banking accounts",
      ],
      urgency: "low",
    };
  }

  // 8. General Greetings & Conversational Questions
  if (
    msgLower === "hi" ||
    msgLower === "hello" ||
    msgLower === "hey" ||
    msgLower.startsWith("hi ") ||
    msgLower.startsWith("hello ") ||
    msgLower.includes("who are you") ||
    msgLower.includes("what can you do")
  ) {
    return {
      response:
        "Hello! I am FraudShield AI, your dedicated digital security and fraud prevention assistant.\n\n" +
        "I can help you with:\n" +
        "🛡️ Explaining why a message, link, or transaction was flagged as risky\n" +
        "🔒 Assessing website permission requests (Camera, Microphone, Location)\n" +
        "🚨 Immediate step-by-step guidance if you sent money or shared credentials\n" +
        "💡 Answering general cybersecurity and online privacy questions\n\n" +
        "How can I assist your digital safety today?",
      suggestedFollowUps: [
        "Why is this link suspicious?",
        "I clicked a suspicious link.",
        "I shared an OTP or password.",
        "How do I manage website permissions?",
      ],
      actionChecklist: [],
      urgency: "low",
    };
  }

  // General default greeting / triage
  return {
    response:
      "Hello! I am your FraudShield Security Assistant. I can help you understand scam alerts, explain why messages or website permissions are flagged, and guide you through immediate recovery steps if you suspect you've been targeted.\n\n" +
      "To help you best, what describes your situation?\n" +
      "• Did you click a link or share credentials?\n" +
      "• Did a website request camera, microphone, or location access?\n" +
      "• Did you authorize a transaction or send money?\n" +
      "• Would you like to check if a specific message or offer is legitimate?",
    suggestedFollowUps: [
      "I clicked a suspicious link.",
      "A website asked for camera permission.",
      "I shared an OTP or password.",
      "I sent money to a scammer.",
    ],
    actionChecklist: [],
    urgency: "low",
  };
}

// ─── External LLM Client Integration ────────────────────────────────────────

/**
 * Builds the LLM system prompt integrating strict safety, privacy, and non-judgmental guidance.
 */
function buildSystemPrompt(context) {
  let prompt =
    "You are FraudShield AI, an empathetic, calm, and security-focused fraud response assistant. " +
    "Your mission is to help users understand why messages or links were flagged as suspicious, " +
    "assess website permission requests (Camera, Microphone, Location), " +
    "triage online fraud incidents, and guide victims through safe, prioritized recovery steps.\n\n" +
    "Strict Rules:\n" +
    "1. Never shame or judge the user for being tricked. Be supportive and action-oriented.\n" +
    "2. Never promise that stolen funds can be recovered. Emphasize that speed matters with banks.\n" +
    "3. Never ask the user to provide actual OTPs, passwords, UPI PINs, or card CVVs. Explicitly remind them not to share secrets.\n" +
    "4. For Indian cybercrime and financial fraud, recommend calling 1930 and reporting at https://cybercrime.gov.in/.\n" +
    "5. When discussing website permissions:\n" +
    "   - Distinguish between a permission request and actual malicious activity (never claim a site is recording without evidence).\n" +
    "   - Explain valid use cases (video calls, KYC for camera; voice search for mic; delivery/maps for location) vs risks.\n" +
    "   - Provide step-by-step instructions to revoke permissions in Google Chrome (tap lock/tune icon in address bar -> Permissions -> Reset) and Android Settings (Settings -> Apps -> Chrome -> Permissions).\n" +
    "6. If the user mentions financial loss or ongoing credential compromise, prioritize immediate action (bank freeze) over long explanations.\n" +
    "7. Answer general questions, cybersecurity queries, and polite conversational messages warmly while maintaining a security focus.";

  if (context) {
    if (context.permissionType) {
      prompt += `\n\nActive Website Permission Request Context:\n` +
        `- Permission Type: ${context.permissionType.toUpperCase()}\n` +
        `- Requesting Domain/URL: ${context.domain || context.safePreview || "N/A"}\n` +
        `- Website Trust Assessment: ${context.trustLevel || "UNKNOWN"}\n` +
        `- Browser: ${context.browser || "Google Chrome"}\n` +
        `Explain why this specific website requested this permission, the security implications, legitimate use cases, and how to deny or revoke it.`;
    } else {
      prompt += `\n\nActive Detection Incident Context:\n` +
        `- Source: ${context.source}\n` +
        `- Classification: ${context.classification}\n` +
        `- Risk Score: ${Math.round(context.riskScore * 100)}%\n` +
        `- Detected Indicators: ${context.reasons.join(", ") || "General heuristic/ML pattern"}\n` +
        `- Safe Preview Excerpt: "${context.safePreview || "N/A"}"\n` +
        `Explain why this specific detection was flagged based ONLY on this evidence. Do not invent details not present here.`;
    }
  }

  return prompt;
}

/**
 * Calls Google Gemini REST API
 */
async function callGeminiApi(systemPrompt, userMessage, history = []) {
  if (!GEMINI_API_KEY) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  
  // Format history into Gemini format
  const contents = [];
  for (const h of history.slice(-6)) {
    contents.push({
      role: h.role === "assistant" ? "model" : "user",
      parts: [{ text: String(h.content || "").substring(0, 1000) }],
    });
  }
  contents.push({
    role: "user",
    parts: [{ text: String(userMessage).substring(0, 1000) }],
  });

  const payload = {
    system_instruction: {
      parts: [{ text: systemPrompt }],
    },
    contents,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 800,
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`[Assistant] Gemini returned HTTP ${res.status}: ${errText.substring(0, 150)}`);
      return null;
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const reply = candidate?.content?.parts?.[0]?.text;
    return reply ? reply.trim() : null;
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn(`[Assistant] Gemini call error: ${err.message || err}`);
    return null;
  }
}

/**
 * Calls OpenAI / OpenAI-compatible chat completions API
 */
async function callOpenAiApi(systemPrompt, userMessage, history = []) {
  if (!LLM_API_KEY) return null;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-6).map((h) => ({
      role: h.role === "assistant" ? "assistant" : "user",
      content: String(h.content || "").substring(0, 1000),
    })),
    { role: "user", content: String(userMessage).substring(0, 1000) },
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(LLM_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        temperature: 0.3,
        max_tokens: 800,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[Assistant] LLM provider returned HTTP ${res.status}`);
      return null;
    }

    const json = await res.json();
    const reply = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    return reply ? reply.trim() : null;
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn(`[Assistant] LLM call failed or timed out: ${err.message || err}`);
    return null;
  }
}

/**
 * Main LLM caller that attempts Gemini first (if configured), then OpenAI-compatible endpoint.
 */
async function callLlmProvider(systemPrompt, userMessage, history = []) {
  if (GEMINI_API_KEY) {
    const geminiReply = await callGeminiApi(systemPrompt, userMessage, history);
    if (geminiReply) return geminiReply;
  }

  if (LLM_API_KEY) {
    const openAiReply = await callOpenAiApi(systemPrompt, userMessage, history);
    if (openAiReply) return openAiReply;
  }

  return null;
}

// ─── Public Service Interface ───────────────────────────────────────────────

/**
 * Main entry point to process assistant messages.
 */
async function processAssistantChat({
  conversationId,
  mode = "general_help",
  detectionContext,
  message,
  history = [],
}) {
  const trimmedMessage = (message || "").trim();
  if (!trimmedMessage) {
    throw new Error("Message content is required");
  }

  const activeMode = mode === "detection_explanation" ? "detection_explanation" : "general_help";
  const validContext = detectionContext ? validateDetectionContext(detectionContext) : null;
  const activeConversationId = conversationId || `conv_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  // Secret safety check: advise user if they appear to be pasting an OTP or PIN
  if (detectSecretsInInput(trimmedMessage)) {
    return {
      conversationId: activeConversationId,
      mode: activeMode,
      response:
        "⚠️ Security Warning: Never send your real OTP, PIN, or password! " +
        "Please NEVER share real one-time passwords or security codes in any chat. " +
        "FraudShield will never ask for your private credentials.",
      suggestedFollowUps: [
        "What should I do if I shared my OTP with someone?",
        "How can I report this incident?",
      ],
      actionChecklist: [
        "Delete the message containing your secret code",
        "If shared with anyone else, contact your bank immediately",
      ],
      urgency: "immediate",
    };
  }

  // 1. Attempt LLM provider if configured
  if (GEMINI_API_KEY || LLM_API_KEY) {
    const systemPrompt = buildSystemPrompt(validContext);
    const llmResponse = await callLlmProvider(systemPrompt, trimmedMessage, history);

    if (llmResponse) {
      const isUrgent =
        trimmedMessage.toLowerCase().includes("money") ||
        trimmedMessage.toLowerCase().includes("sent") ||
        trimmedMessage.toLowerCase().includes("otp");

      let followUps = [];
      if (validContext?.permissionType) {
        followUps = [
          `How do I revoke permissions for ${validContext.domain || "this site"}?`,
          "Can websites record without my knowledge?",
          "How do I manage site settings in Chrome?",
        ];
      } else if (activeMode === "detection_explanation") {
        followUps = ["Why is this link suspicious?", "Could this be a real bank message?", "What should I do next?"];
      } else {
        followUps = ["I clicked a link.", "A website asked for permissions.", "I shared an OTP.", "I sent money."];
      }

      return {
        conversationId: activeConversationId,
        mode: activeMode,
        response: llmResponse,
        suggestedFollowUps: followUps,
        actionChecklist: isUrgent
          ? ["Contact your bank customer care immediately", "Call National Cybercrime Helpline 1930"]
          : [],
        urgency: isUrgent ? "immediate" : "low",
      };
    }
  }

  // 2. Seamless Domain-Expert Fallback Engine
  if (validContext && (activeMode === "detection_explanation" || validContext.permissionType)) {
    const explanation = generateDetectionExplanation(validContext, trimmedMessage);
    return {
      conversationId: activeConversationId,
      mode: activeMode,
      ...explanation,
    };
  }

  const recovery = generateGuidedRecovery(trimmedMessage);
  return {
    conversationId: activeConversationId,
    mode: activeMode,
    ...recovery,
  };
}

module.exports = {
  processAssistantChat,
  validateDetectionContext,
  HELPLINE_INFO,
};
