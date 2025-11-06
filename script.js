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

// Initial greeting
chatWindow.innerHTML = "";
appendMessage("👋 Hello! How can I help you today?", "ai");

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

  // Build messages array for the chat completion
  const messages = [
    { role: "system", content: "You are a helpful product advisor." },
    { role: "user", content: userMessage },
  ];

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

    // Send the messages to the Cloudflare Worker which proxies the OpenAI API.
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
