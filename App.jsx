import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from './supabaseClient';
import './App.css';

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Auth Form States
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');

  // Chat & App States
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [activeView, setActiveView] = useState('chat');
  
  // Sidebar Open State (Desktop par default true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const [redeemCodeInput, setRedeemCodeInput] = useState('');
  const [redeemResponse, setRedeemResponse] = useState('');
  const [redeemResponseType, setRedeemResponseType] = useState('');

  // --- LIMIT & USAGE STATES ---
  const [isUnlimited, setIsUnlimited] = useState(() => {
    return localStorage.getItem('zynora_unlimited') === 'true';
  });

  const [chatCount, setChatCount] = useState(() => {
    return parseInt(localStorage.getItem('zynora_chat_count') || '0', 10);
  });

  const [, setImageCount] = useState(() => {
    return parseInt(localStorage.getItem('zynora_image_count') || '0', 10);
  });

  const [cooldownEnd, setCooldownEnd] = useState(() => {
    return parseInt(localStorage.getItem('zynora_cooldown_end') || '0', 10);
  });

  const [timeLeft, setTimeLeft] = useState('');

  const chatEndRef = useRef(null);
  const API_URL = 'http://localhost:8080';

  // Check Supabase Auth Session on Load
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Cooldown timer check every second
  useEffect(() => {
    if (isUnlimited) return;

    const interval = setInterval(() => {
      const now = Date.now();
      if (cooldownEnd && now < cooldownEnd) {
        const diff = cooldownEnd - now;
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      } else if (cooldownEnd && now >= cooldownEnd) {
        localStorage.removeItem('zynora_cooldown_end');
        localStorage.setItem('zynora_chat_count', '0');
        localStorage.setItem('zynora_image_count', '0');
        setChatCount(0);
        setImageCount(0);
        setCooldownEnd(0);
        setTimeLeft('');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [cooldownEnd, isUnlimited]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const loadSessions = async () => {
      try {
        const res = await fetch(`${API_URL}/sessions`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setSessions(data);
        }
      } catch (err) {
        console.error('Sessions fetch error:', err);
      }
    };

    loadSessions();
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!currentSessionId || !session) return;

    let cancelled = false;
    const loadMessages = async () => {
      try {
        const res = await fetch(`${API_URL}/sessions/${currentSessionId}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setMessages(data.messages || []);
        }
      } catch (err) {
        console.error('Messages fetch error:', err);
      }
    };

    loadMessages();
    return () => {
      cancelled = true;
    };
  }, [currentSessionId, session]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthMessage('');

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setAuthError(error.message);
      else setAuthMessage('Signup successful! Please check your email or log in.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setAuthError(error.message);
    }
  };

  const handleSocialLogin = async (provider) => {
    const { error } = await supabase.auth.signInWithOAuth({ provider });
    if (error) setAuthError(error.message);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() && !loading) return;

    if (!isUnlimited) {
      const now = Date.now();
      if (cooldownEnd && now < cooldownEnd) {
        alert(`Limit reached! Please wait ${timeLeft} or redeem a code.`);
        return;
      }
      if (chatCount >= 100) {
        const twentyFourHours = 24 * 60 * 60 * 1000;
        const newCooldown = now + twentyFourHours;
        localStorage.setItem('zynora_cooldown_end', newCooldown.toString());
        setCooldownEnd(newCooldown);
        alert("You have reached your limit of 100 chats.");
        return;
      }
    }

    const userMsg = input;
    setInput('');
    setLoading(true);
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: currentSessionId, message: userMsg })
      });

      if (res.ok) {
        const data = await res.json();
        if (!currentSessionId && data.session_id) {
          setCurrentSessionId(data.session_id);
        }
        setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
        
        const sRes = await fetch(`${API_URL}/sessions`);
        if (sRes.ok) setSessions(await sRes.json());

        if (!isUnlimited) {
          const newCount = chatCount + 1;
          setChatCount(newCount);
          localStorage.setItem('zynora_chat_count', newCount.toString());
        }
      }
    } catch (err) {
      console.error('Chat error:', err);
    } finally {
      setLoading(false);
    }
  };

  const deleteSession = async (e, sessionId) => {
    e.stopPropagation();
    if (!sessionId) return;
    try {
      const res = await fetch(`${API_URL}/sessions/${sessionId}`, { method: 'DELETE' });
      if (res.ok) {
        setSessions((prev) => prev.filter(s => s.id !== sessionId));
        if (currentSessionId === sessionId) {
          setCurrentSessionId(null);
          setMessages([]);
        }
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleRedeemSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: redeemCodeInput })
      });
      const data = await res.json();
      if (res.ok) {
        setRedeemResponse(data.message || "Success! Unlimited access unlocked.");
        setRedeemResponseType("success");
        setIsUnlimited(true);
        localStorage.setItem('zynora_unlimited', 'true');
        localStorage.removeItem('zynora_cooldown_end');
        setCooldownEnd(0);
      } else {
        setRedeemResponse(data.detail || "Invalid Code!");
        setRedeemResponseType("error");
      }
    } catch {
      setRedeemResponse("Server connection error.");
      setRedeemResponseType("error");
    }
  };

  const sharedButtonStyle = {
    padding: "12px 16px",
    background: "linear-gradient(135deg, #7c3aed 0%, #9333ea 100%)",
    color: "white",
    border: "none",
    borderRadius: "10px",
    fontWeight: "600",
    cursor: "pointer",
    width: "100%",
    textAlign: "center",
    boxShadow: "0 4px 12px rgba(147, 51, 234, 0.3)",
    fontSize: "14px"
  };

  if (authLoading) {
    return (
      <div style={{ display: "flex", height: "100vh", background: "#0c0718", color: "white", justifyContent: "center", alignItems: "center" }}>
        Loading Zynora AI...
      </div>
    );
  }

  // --- LOGIN SCREEN ---
  if (!session) {
    return (
      <div style={{ display: "flex", height: "100vh", background: "linear-gradient(135deg, #090314 0%, #150b2e 50%, #06020c 100%)", color: "white", justifyContent: "center", alignItems: "center", padding: "20px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", width: "100%", maxWidth: "1000px", height: "600px", background: "rgba(14, 9, 28, 0.6)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "24px", boxShadow: "0 20px 50px rgba(0,0,0,0.6)", overflow: "hidden" }}>
          <div style={{ flex: 1, padding: "40px", display: "flex", flexDirection: "column", justifyContent: "space-between", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "30px" }}>
                <div style={{ width: "32px", height: "32px", background: "linear-gradient(135deg, #c084fc, #9333ea)", borderRadius: "8px", display: "flex", justifyContent: "center", alignItems: "center" }}>✦</div>
                <span style={{ fontSize: "18px", fontWeight: "bold" }}>Zynora <span style={{ color: "#c084fc" }}>AI</span></span>
              </div>
              <h1 style={{ fontSize: "36px", fontWeight: "800", marginBottom: "12px" }}>Welcome <span style={{ color: "#c084fc" }}>Back</span> ✨</h1>
              <p style={{ fontSize: "14px", color: "#a1a1aa" }}>Sign in to continue your journey with Zynora AI.</p>
            </div>
          </div>
          <div style={{ width: "420px", padding: "40px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <h2 style={{ fontSize: "20px", fontWeight: "700", marginBottom: "6px" }}>{isSignUp ? "Create Account" : "Sign In"}</h2>
            <form onSubmit={handleAuthSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "16px" }}>
              <input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} required
                style={{ width: "100%", padding: "12px 14px", background: "rgba(19, 13, 34, 0.8)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", color: "white", outline: "none", fontSize: "14px", boxSizing: "border-box" }} />
              <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required
                style={{ width: "100%", padding: "12px 14px", background: "rgba(19, 13, 34, 0.8)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", color: "white", outline: "none", fontSize: "14px", boxSizing: "border-box" }} />
              {authError && <div style={{ fontSize: "12px", color: "#f87171" }}>{authError}</div>}
              {authMessage && <div style={{ fontSize: "12px", color: "#4ade80" }}>{authMessage}</div>}
              <button type="submit" style={sharedButtonStyle}>{isSignUp ? "Sign Up" : "Sign In"}</button>
            </form>
            <button onClick={() => handleSocialLogin('google')} style={{ width: "100%", marginTop: "12px", padding: "12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", color: "white", cursor: "pointer", fontSize: "13px" }}>
              Continue with Google
            </button>
            <div style={{ textAlign: "center", marginTop: "20px", fontSize: "13px", color: "#a1a1aa" }}>
              {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
              <span onClick={() => setIsSignUp(!isSignUp)} style={{ color: "#c084fc", cursor: "pointer", fontWeight: "600" }}>
                {isSignUp ? "Sign In" : "Sign Up"}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- MAIN APP DASHBOARD WITHOUT CROSS BUTTON IN SIDEBAR ---
  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", background: "#0c0718", color: "white", overflow: "hidden" }}>
      
      {/* Sidebar - Cross button removed completely */}
      <div style={{
        width: isSidebarOpen ? "260px" : "0px",
        minWidth: isSidebarOpen ? "260px" : "0px",
        height: "100%",
        background: "#110a24",
        borderRight: isSidebarOpen ? "1px solid rgba(255,255,255,0.08)" : "none",
        display: "flex",
        flexDirection: "column",
        padding: isSidebarOpen ? "16px" : "0px",
        boxSizing: "border-box",
        overflow: "hidden",
        transition: "all 0.3s ease"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", whiteSpace: "nowrap" }}>
          <div style={{ fontSize: "16px", fontWeight: "bold", color: "#c084fc" }}>✦ Zynora AI</div>
        </div>

        <button onClick={() => { setActiveView('chat'); setCurrentSessionId(null); setMessages([]); }} style={{ ...sharedButtonStyle, marginBottom: "8px", whiteSpace: "nowrap" }}>
          + New Chat
        </button>

        <button onClick={() => setActiveView('redeem')} style={{ ...sharedButtonStyle, marginBottom: "16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", whiteSpace: "nowrap" }}>
          🔑 Redeem Code
        </button>

        {!isUnlimited && (
          <div style={{ background: "rgba(255,255,255,0.03)", padding: "10px", borderRadius: "8px", marginBottom: "12px", fontSize: "12px", border: "1px solid rgba(255,255,255,0.05)", whiteSpace: "nowrap" }}>
            <div style={{ color: "#a1a1aa", marginBottom: "2px" }}>Free Tier:</div>
            <div>Chats: {chatCount} / 100</div>
            {cooldownEnd > 0 && <div style={{ color: "#f87171", marginTop: "2px" }}>Cooldown: {timeLeft}</div>}
          </div>
        )}

        <div style={{ fontSize: "11px", color: "#71717a", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>Recent Chats</div>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px" }}>
          {sessions.map((s) => (
            <div key={s.id} onClick={() => { setActiveView('chat'); setCurrentSessionId(s.id); }}
              style={{ padding: "10px", background: currentSessionId === s.id ? "rgba(147, 51, 234, 0.2)" : "transparent", borderRadius: "8px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", whiteSpace: "nowrap" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "150px", color: currentSessionId === s.id ? "#fff" : "#cbd5e1" }}>{s.title}</span>
              <button onClick={(e) => deleteSession(e, s.id)} style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer" }}>🗑️</button>
            </div>
          ))}
        </div>

        <button onClick={handleLogout} style={{ padding: "10px", background: "rgba(248, 113, 113, 0.1)", color: "#f87171", border: "1px solid rgba(248, 113, 113, 0.2)", borderRadius: "8px", fontWeight: "600", cursor: "pointer", marginTop: "10px", fontSize: "13px", whiteSpace: "nowrap" }}>
          Log Out
        </button>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "#0c0718", transition: "all 0.3s ease" }}>
        
        {/* Top Navbar */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", background: "#0c0718" }}>
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={{ background: "rgba(147, 51, 234, 0.2)", border: "1px solid rgba(147, 51, 234, 0.4)", color: "white", padding: "6px 10px", borderRadius: "8px", cursor: "pointer", fontSize: "14px" }}>
            ☰
          </button>
          <div style={{ fontSize: "15px", fontWeight: "600" }}>
            Zynora AI {activeView === 'redeem' ? '— Redeem Center' : ''}
          </div>
        </div>

        {/* View Switcher: Redeem or Chat */}
        {activeView === 'redeem' ? (
          <div style={{ flex: 1, overflowY: "auto", padding: "30px", display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
            <div style={{ maxWidth: "600px", width: "100%", background: "#130d22", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "28px" }}>
              <h2 style={{ fontSize: "18px", marginBottom: "12px", color: "#c084fc" }}>Unlock Unlimited Access</h2>
              <p style={{ fontSize: "13px", color: "#a1a1aa", marginBottom: "20px" }}>Enter your special code below to unlock unrestricted AI usage.</p>
              <form onSubmit={handleRedeemSubmit} style={{ display: "flex", gap: "10px" }}>
                <input type="text" placeholder="Enter code here..." value={redeemCodeInput} onChange={(e) => setRedeemCodeInput(e.target.value)}
                  style={{ flex: 1, padding: "12px 14px", background: "#0c0718", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", color: "white", outline: "none", fontSize: "14px" }} />
                <button type="submit" style={{ padding: "0 20px", background: "#9333ea", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", cursor: "pointer" }}>Redeem</button>
              </form>
              {redeemResponse && <div style={{ marginTop: "14px", fontSize: "13px", color: redeemResponseType === 'error' ? "#f87171" : "#4ade80" }}>{redeemResponse}</div>}
              {isUnlimited && <div style={{ marginTop: "10px", fontSize: "13px", color: "#4ade80", fontWeight: "600" }}>✨ Unlimited Access Active!</div>}
            </div>
          </div>
        ) : (
          <>
            <div style={{ flex: 1, overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
              {messages.length === 0 ? (
                <div style={{ margin: "auto", textAlign: "center", color: "#71717a" }}>
                  <h2 style={{ fontSize: "22px", fontWeight: "600", color: "#e2e8f0" }}>How can I help you today?</h2>
                </div>
              ) : (
                messages.map((m, idx) => (
                  <div key={idx} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: "75%", background: m.role === 'user' ? '#9333ea' : '#16102a', padding: "12px 16px", borderRadius: "12px", fontSize: "14px", lineHeight: "1.5" }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  </div>
                ))
              )}
              {loading && <div style={{ color: "#a1a1aa", fontSize: "13px", fontStyle: "italic" }}>Zynora is thinking...</div>}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleSendMessage} style={{ padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: "10px", background: "#0c0718" }}>
              <input type="text" placeholder={cooldownEnd > 0 && timeLeft ? `Cooldown active (${timeLeft})...` : "Ask anything..."} 
                value={input} onChange={(e) => setInput(e.target.value)} disabled={Boolean(cooldownEnd > 0 && timeLeft && !isUnlimited)}
                style={{ flex: 1, padding: "12px 16px", background: "#130d22", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", color: "white", outline: "none", fontSize: "14px" }} />
              <button type="submit" style={{ padding: "0 20px", background: "#9333ea", color: "white", border: "none", borderRadius: "10px", fontWeight: "bold", cursor: "pointer", fontSize: "14px" }}>Send</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default App;