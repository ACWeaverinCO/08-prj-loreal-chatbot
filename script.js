/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");

// Simple helper to append messages and keep scroll at bottom
function appendMessage(text, cls = "ai") {
  const el = document.createElement("div");
  el.className = `msg ${cls}`;
  el.textContent = text;
  chatWindow.appendChild(el);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Small helper to persist conversation state (messages + user name)
function saveState() {
  try {
    const toSave = {
      messages,
    };
    localStorage.setItem("chat_state", JSON.stringify(toSave));
  } catch (e) {
    console.warn("Could not save chat state:", e);
  }
}

// Conversation & user state
const MAX_HISTORY_MESSAGES = 20; // keep a bounded number of past turns to control token growth

let userName = null;
let messages = null;

// Load saved state (if any)
try {
  const raw = localStorage.getItem("chat_state");
  if (raw) {
    const parsed = JSON.parse(raw);
    // Don't restore a saved userName. We no longer prompt for or persist personal names.
    messages = parsed.messages || null;
  }
} catch (e) {
  console.warn("Could not parse saved chat state:", e);
}

const baseSystemPrompt = "You are a helpful product advisor.";

function systemPromptFor(name) {
  if (name)
    return `${baseSystemPrompt} The user's name is ${name}. Remember details they share and keep responses friendly and concise.`;
  return baseSystemPrompt;
}

// Ensure we have an initial messages array with a system prompt
if (!Array.isArray(messages) || messages.length === 0) {
  messages = [{ role: "system", content: systemPromptFor(userName) }];
}

// Initial greeting (only show if no prior assistant message saved)
chatWindow.innerHTML = "";
if (!messages.some((m) => m.role === "assistant")) {
  appendMessage("👋 Hello! How can I help you today?", "ai");
}

// keep state persisted when page is left or periodically
window.addEventListener("beforeunload", saveState);

/* Handle form submit */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const userMessage = userInput.value.trim();
  if (!userMessage) return;

  // Show user's message in the UI
  appendMessage(userMessage, "user");

  // Show a loading placeholder for the AI
  const thinkingEl = document.createElement("div");
  // mark as loading so it doesn't animate like final replies
  thinkingEl.className = "msg ai loading";
  thinkingEl.textContent = "🤔 Thinking...";
  chatWindow.appendChild(thinkingEl);
  chatWindow.scrollTop = chatWindow.scrollHeight;

  // NOTE: removed optional name prompt. We do not ask for or persist personal names.

  // Append the user's message to the conversation history we keep
  messages.push({ role: "user", content: userMessage });
  // prune history to keep recent context while preserving the system message
  const historyOnly = messages.slice(1); // exclude system for counting
  if (historyOnly.length > MAX_HISTORY_MESSAGES * 2) {
    // keep the latest N messages (roles alternate user/assistant, approx)
    const keep = historyOnly.slice(-MAX_HISTORY_MESSAGES * 2);
    messages = [messages[0], ...keep];
  }
  // persist state before the network call
  saveState();

  // Config: how many tokens to allow for the model's reply.
  // Increase this if responses are getting cut off. Keep in mind model + prompt tokens count toward limits.
  const MAX_TOKENS = 800;

  // If you have a Cloudflare Worker deployed, set its URL here. When set,
  // the client will call the worker (which holds the API key) instead of
  // calling OpenAI directly from the browser. Leave empty to use local
  // direct calls (requires `secrets.js`).
  const WORKER_URL = "https://floral-unit-4d9b.ashley-weaver.workers.dev/"; // set to your worker URL

  try {
    if (!WORKER_URL) {
      throw new Error(
        "WORKER_URL is not set. Please configure the worker URL in script.js."
      );
    }

    // Send the messages (full conversation) to the Cloudflare Worker which proxies the OpenAI API.
    const workerResp = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, max_tokens: MAX_TOKENS }),
    });

    if (!workerResp.ok) {
      const errText = await workerResp.text();
      thinkingEl.remove();
      appendMessage("Sorry — the worker returned an error. See console.", "ai");
      console.error("Worker error response:", workerResp.status, errText);
      return;
    }

    const data = await workerResp.json();
    thinkingEl.remove();
    const aiText = data?.choices?.[0]?.message?.content;
    if (!aiText) {
      appendMessage("Sorry — I didn't get a response from the AI.", "ai");
      console.error("Worker/OpenAI response:", data);
    } else {
      // add assistant reply to history and persist
      messages.push({ role: "assistant", content: aiText });
      // prune again to be safe
      const historyOnlyAfter = messages.slice(1);
      if (historyOnlyAfter.length > MAX_HISTORY_MESSAGES * 2) {
        const keep = historyOnlyAfter.slice(-MAX_HISTORY_MESSAGES * 2);
        messages = [messages[0], ...keep];
      }
      saveState();
      appendMessage(aiText, "ai");
    }
    userInput.value = "";
    userInput.focus();
  } catch (err) {
    // Replace thinking placeholder with an error
    thinkingEl.remove();
    appendMessage("Sorry, something went wrong. Check the console.", "ai");
    console.error(err);
  }
});
