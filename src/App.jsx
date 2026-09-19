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
  
  // Mobile Sidebar Toggle State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
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

  const [imageCount, setImageCount] = useState(() => {
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

  const fetchSessions = async () => {
    try {
      const res = await fetch(`${API_URL}/sessions`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (err) {
      console.error('Sessions fetch error:', err);
    }
  };

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

  // Auth Submit Handler
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthMessage('');

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setAuthError(error.message);
      } else {
        setAuthMessage('Signup successful! Please check your email or log in.');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setAuthError(error.message);
      }
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
        alert(`Limit reached! Please wait ${timeLeft} or redeem a code to continue.`);
        return;
      }
      if (chatCount >= 100) {
        const twentyFourHours = 24 * 60 * 60 * 1000;
        const newCooldown = now + twentyFourHours;
        localStorage.setItem('zynora_cooldown_end', newCooldown.toString());
        setCooldownEnd(newCooldown);
        alert("You have reached your limit of 100 chats. Please wait 24 hours or redeem a code.");
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
        body: JSON.stringify({
          session_id: currentSessionId,
          message: userMsg
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (!currentSessionId && data.session_id) {
          setCurrentSessionId(data.session_id);
        }
        setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
        fetchSessions();

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
      const res = await fetch(`${API_URL}/sessions/${sessionId}`, {
        method: 'DELETE'
      });
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
    padding: "14px",
    background: "linear-gradient(135deg, #7c3aed 0%, #9333ea 100%)",
    color: "white",
    border: "none",
    borderRadius: "12px",
    fontWeight: "600",
    cursor: "pointer",
    width: "100%",
    textAlign: "center",
    boxShadow: "0 4px 16px rgba(147, 51, 234, 0.4)",
    transition: "all 0.2s ease"
  };

  if (authLoading) {
    return (
      <div style={{ display: "flex", height: "100vh", background: "#0c0718", color: "white", justifyContent: "center", alignItems: "center" }}>
        Loading Zynora AI...
      </div>
    );
  }

  // --- STUNNING COSMIC GLASSMORPHISM LOGIN SCREEN (Google only, no GitHub) ---
  if (!session) {
    return (
      <div style={{ 
        display: "flex", 
        height: "100vh", 
        background: "linear-gradient(135deg, #090314 0%, #150b2e 50%, #06020c 100%)", 
        color: "white", 
        justifyContent: "center", 
        alignItems: "center", 
        padding: "40px",
        boxSizing: "border-box",
        overflow: "hidden",
        position: "relative"
      }}>
        <div style={{ position: "absolute", width: "400px", height: "400px", background: "rgba(147, 51, 234, 0.15)", filter: "blur(100px)", borderRadius: "50%", top: "10%", left: "15%" }}></div>
        
        <div style={{ 
          display: "flex", 
          width: "100%", 
          maxWidth: "1150px", 
          height: "650px", 
          background: "rgba(14, 9, 28, 0.45)", 
          backdropFilter: "blur(24px)", 
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.08)", 
          borderRadius: "28px", 
          boxShadow: "0 24px 60px rgba(0,0,0,0.7)", 
          overflow: "hidden",
          zIndex: 1
        }}>
          {/* Left Hero Section */}
          <div style={{ flex: 1, padding: "50px", display: "flex", flexDirection: "column", justifyContent: "space-between", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "40px" }}>
                <div style={{ width: "36px", height: "36px", background: "linear-gradient(135deg, #c084fc, #9333ea)", borderRadius: "10px", display: "flex", justifyContent: "center", alignItems: "center", boxShadow: "0 0 15px rgba(192, 132, 252, 0.5)" }}>✦</div>
                <span style={{ fontSize: "20px", fontWeight: "bold", letterSpacing: "0.5px" }}>Zynora <span style={{ color: "#c084fc" }}>AI</span></span>
              </div>
              <h1 style={{ fontSize: "42px", fontWeight: "800", lineHeight: "1.2", marginBottom: "16px" }}>
                Welcome <span style={{ background: "linear-gradient(90deg, #c084fc, #e879f9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Back</span> ✨
              </h1>
              <p style={{ fontSize: "15px", color: "#a1a1aa", lineHeight: "1.6", maxWidth: "400px" }}>
                Sign in to continue your journey with Zynora AI. Your ideas, our intelligence.
              </p>
            </div>

            <div style={{ display: "flex", gap: "24px" }}>
              <div>
                <div style={{ fontSize: "15px", fontWeight: "bold", color: "white", marginBottom: "4px" }}>⚡ Fast</div>
                <div style={{ fontSize: "13px", color: "#71717a" }}>Instant responses</div>
              </div>
              <div>
                <div style={{ fontSize: "15px", fontWeight: "bold", color: "white", marginBottom: "4px" }}>🛡️ Secure</div>
                <div style={{ fontSize: "13px", color: "#71717a" }}>Data safety first</div>
              </div>
              <div>
                <div style={{ fontSize: "15px", fontWeight: "bold", color: "white", marginBottom: "4px" }}>✨ Smart</div>
                <div style={{ fontSize: "13px", color: "#71717a" }}>Advanced AI</div>
              </div>
            </div>
          </div>

          {/* Right Form Section */}
          <div style={{ width: "450px", padding: "50px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ marginBottom: "28px" }}>
              <h2 style={{ fontSize: "22px", fontWeight: "700", marginBottom: "6px" }}>{isSignUp ? "Create an Account" : "Sign in to account"}</h2>
              <p style={{ fontSize: "13px", color: "#a1a1aa" }}>{isSignUp ? "Enter your details to get started" : "Welcome back! Please enter your details."}</p>
            </div>

            <form onSubmit={handleAuthSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", color: "#d4d4d8", marginBottom: "6px", fontWeight: "500" }}>Email address</label>
                <input type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required
                  style={{ width: "100%", padding: "14px 16px", background: "rgba(19, 13, 34, 0.6)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", color: "white", outline: "none", fontSize: "14px", boxSizing: "border-box" }} />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", color: "#d4d4d8", marginBottom: "6px", fontWeight: "500" }}>Password</label>
                <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required
                  style={{ width: "100%", padding: "14px 16px", background: "rgba(19, 13, 34, 0.6)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", color: "white", outline: "none", fontSize: "14px", boxSizing: "border-box" }} />
              </div>

              {authError && <div style={{ fontSize: "13px", color: "#f87171", background: "rgba(248, 113, 113, 0.1)", padding: "10px", borderRadius: "8px" }}>{authError}</div>}
              {authMessage && <div style={{ fontSize: "13px", color: "#4ade80", background: "rgba(74, 222, 128, 0.1)", padding: "10px", borderRadius: "8px" }}>{authMessage}</div>}

              <button type="submit" style={{ ...sharedButtonStyle, marginTop: "6px" }}>
                {isSignUp ? "Create Account" : "Sign In"}
              </button>
            </form>

            <div style={{ display: "flex", alignItems: "center", margin: "24px 0", color: "#52525b", fontSize: "12px" }}>
              <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.08)" }}></div>
              <span style={{ padding: "0 12px" }}>or continue with</span>
              <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.08)" }}></div>
            </div>

            <div style={{ display: "flex", gap: "12px" }}>
              <button onClick={() => handleSocialLogin('google')} style={{ flex: 1, padding: "12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", color: "white", cursor: "pointer", fontSize: "13px", fontWeight: "500" }}>
                Google
              </button>
            </div>

            <div style={{ textAlign: "center", marginTop: "24px", fontSize: "13px", color: "#a1a1aa" }}>
              {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
              <span onClick={() => { setIsSignUp(!isSignUp); setAuthError(''); setAuthMessage(''); }}
                style={{ color: "#c084fc", cursor: "pointer", fontWeight: "600" }}>
                {isSignUp ? "Sign In" : "Create account"}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- MAIN APP DASHBOARD WHEN LOGGED IN (With Mobile Responsive Slide-out Sidebar) ---
  return (
    <div className="flex h-screen bg-[#0c0718] text-white overflow-hidden relative">
      
      {/* Mobile Backdrop Overlay when Sidebar is Open */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
        />
      )}

      {/* Sidebar (Drawer style on mobile, fixed on desktop) */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-[#110a24] border-r border-white/10 flex flex-col p-4 
        transform transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
        md:translate-x-0 md:static
      `}>
        <div className="flex justify-between items-center mb-5">
          <div className="text-lg font-bold text-[#c084fc]">✦ Zynora AI</div>
          {/* Close button for mobile inside sidebar */}
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden text-gray-400 hover:text-white text-lg p-1"
          >
            ✕
          </button>
        </div>
        
        <button onClick={() => { setActiveView('chat'); setCurrentSessionId(null); setMessages([]); setIsSidebarOpen(false); }}
          style={{ ...sharedButtonStyle, opacity: activeView === 'chat' ? 1 : 0.85, marginBottom: "10px" }}>
          + New Chat
        </button>

        <button onClick={() => { setActiveView('redeem'); setIsSidebarOpen(false); }}
          style={{ ...sharedButtonStyle, opacity: activeView === 'redeem' ? 1 : 0.85, marginBottom: "20px" }}>
          🔑 Redeem Code
        </button>

        {!isUnlimited && (
          <div style={{ background: "rgba(255,255,255,0.03)", padding: "10px", borderRadius: "8px", marginBottom: "12px", fontSize: "12px", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ color: "#a1a1aa", marginBottom: "4px" }}>Free Tier Usage:</div>
            <div>Chats: {chatCount} / 100</div>
            <div>Images: {imageCount} / 10</div>
            {cooldownEnd > 0 && <div style={{ color: "#f87171", marginTop: "4px" }}>Cooldown: {timeLeft}</div>}
          </div>
        )}

        <div style={{ fontSize: "12px", color: "#71717a", marginBottom: "8px" }}>Recent Chats</div>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px" }}>
          {sessions.map((s) => (
            <div key={s.id} onClick={() => { setActiveView('chat'); setCurrentSessionId(s.id); setIsSidebarOpen(false); }}
              style={{ padding: "10px", background: currentSessionId === s.id ? "rgba(147, 51, 234, 0.2)" : "transparent", borderRadius: "8px", cursor: "pointer", display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "160px" }}>{s.title}</span>
              <button onClick={(e) => deleteSession(e, s.id)} style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer" }}>🗑️</button>
            </div>
          ))}
        </div>

        {/* Logout Button */}
        <button onClick={handleLogout} style={{ padding: "10px", background: "rgba(248, 113, 113, 0.1)", color: "#f87171", border: "1px solid rgba(248, 113, 113, 0.2)", borderRadius: "8px", fontWeight: "600", cursor: "pointer", marginTop: "12px" }}>
          Log Out
        </button>
      </aside>

      {/* Main Panel */}
      <div className="flex-1 flex flex-col h-full w-full overflow-hidden">
        
        {/* Top Header with Hamburger Toggle for Mobile */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-[#0c0718]">
          <button 
            onClick={() => setIsSidebarOpen(true)} 
            className="md:hidden text-white bg-purple-900/60 p-2 rounded-lg border border-purple-500/30 flex items-center justify-center text-sm"
          >
            ☰
          </button>
          <div className="text-base font-semibold">
            ✦ Zynora AI {activeView === 'redeem' ? 'Redeem Center' : 'Chat'}
          </div>
        </div>

        {activeView === 'redeem' ? (
          <div style={{ flex: 1, overflowY: "auto", padding: "32px 24px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ maxWidth: "650px", width: "100%", background: "#16102a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "32px", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
              <h2 style={{ fontSize: "20px", marginBottom: "16px", color: "#c084fc", fontWeight: "700" }}>Benefits:</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "14px", color: "#d4d4d8", marginBottom: "28px", lineHeight: "1.6" }}>
                <div>⚡ More AI Usage — Get additional AI requests</div>
                <div>🚀 Priority Access — Enjoy faster access during busy times</div>
                <div>✨ Premium Features — Unlock selected premium AI tools</div>
                <div>🎨 Image Generation — Get access to image generation features</div>
                <div>💾 More History — Keep more of your conversations</div>
                <div>🔓 Exclusive Access — Unlock special features available through codes</div>
              </div>

              <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "24px" }}>
                <h3 style={{ fontSize: "16px", marginBottom: "12px", color: "white" }}>Enter Redeem Code</h3>
                <form onSubmit={handleRedeemSubmit} style={{ display: "flex", gap: "12px" }}>
                  <input type="text" placeholder="Enter your code here..." value={redeemCodeInput} onChange={(e) => setRedeemCodeInput(e.target.value)}
                    style={{ flex: 1, padding: "14px 18px", background: "#130d22", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", color: "white", outline: "none", fontSize: "14px" }} />
                  <button type="submit" style={{ padding: "0 24px", background: "#9333ea", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", cursor: "pointer", fontSize: "14px" }}>Redeem</button>
                </form>
                {redeemResponse && (
                  <div style={{ marginTop: "16px", fontSize: "14px", color: redeemResponseType === 'error' ? "#f87171" : "#4ade80" }}>
                    {redeemResponse}
                  </div>
                )}
                {isUnlimited && (
                  <div style={{ marginTop: "12px", fontSize: "14px", color: "#4ade80", fontWeight: "600" }}>
                    ✨ Status: Unlimited Access Unlocked!
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div style={{ flex: 1, overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
              {messages.length === 0 ? (
                <div style={{ margin: "auto", textAlign: "center", color: "#71717a" }}><h2>How can I help you today?</h2></div>
              ) : (
                messages.map((m, idx) => (
                  <div key={idx} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: "75%", background: m.role === 'user' ? '#9333ea' : '#16102a', padding: "14px 18px", borderRadius: "14px", fontSize: "14px" }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  </div>
                ))
              )}
              {loading && <div style={{ color: "#a1a1aa", fontStyle: "italic" }}>Zynora is thinking...</div>}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={handleSendMessage} style={{ padding: "20px 24px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: "12px" }}>
              <input type="text" placeholder={cooldownEnd > 0 && timeLeft ? `Cooldown active (${timeLeft})...` : "Ask anything..."} 
                value={input} onChange={(e) => setInput(e.target.value)} disabled={Boolean(cooldownEnd > 0 && timeLeft && !isUnlimited)}
                style={{ flex: 1, padding: "14px", background: "#130d22", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", color: "white", outline: "none" }} />
              <button type="submit" style={{ padding: "0 24px", background: "#9333ea", color: "white", border: "none", borderRadius: "12px", fontWeight: "bold", cursor: "pointer" }}>Send</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
