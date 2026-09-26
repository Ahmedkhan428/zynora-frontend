import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowDown, ArrowRight, Bell, ChevronDown, ChevronRight, Code2, FileText, Image, ImagePlus, Lightbulb, Menu, MoreHorizontal, Plus, Search, Send, Sparkles, Sun, Moon, Trash2, X } from 'lucide-react';
import { supabase } from './supabaseClient';
import './App.css';

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [imageAttachment, setImageAttachment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [sessions, setSessions] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState('');
  const [activeView, setActiveView] = useState('chat');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showRecent, setShowRecent] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [lightTheme, setLightTheme] = useState(false);
  
  const [redeemCodeInput, setRedeemCodeInput] = useState('');
  const [redeemResponse, setRedeemResponse] = useState('');
  const [redeemResponseType, setRedeemResponseType] = useState('');
  const [usage, setUsage] = useState(null);

  const chatEndRef = useRef(null);
  const imageInputRef = useRef(null);
  const authUserIdRef = useRef(null);
  const API_URL = import.meta.env.DEV
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "https://zynora-backend-production.up.railway.app";

  const chatApiFetch = useCallback((path, options = {}) => {
    if (!session?.access_token) throw new Error('Sign in to access chat history');
    return fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${session.access_token}`,
      },
    });
  }, [session, API_URL]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      authUserIdRef.current = session?.user?.id ?? null;
      setSession(session);
      if (session) {
        setCurrentSessionId("chat_" + Date.now());
      }
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextUserId = nextSession?.user?.id ?? null;
      if (authUserIdRef.current !== nextUserId) {
        authUserIdRef.current = nextUserId;
        setMessages([]);
        setSessions([]);
        setUsage(null);
        setDeleteTarget(null);
        setImageAttachment(null);
        setChatError('');
        setCurrentSessionId(nextSession ? "chat_" + Date.now() : '');
      }
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const loadSessions = async () => {
      try {
        const res = await chatApiFetch('/sessions');
        if (res.ok && !cancelled) {
          const data = await res.json();
          setSessions(data);
          if (data.length > 0 && !currentSessionId) {
            setCurrentSessionId(data[0].user_id);
          } else if (data.length === 0 && !currentSessionId) {
            setCurrentSessionId("chat_" + Date.now());
          }
        }
      } catch (err) {
        console.error('Sessions fetch error:', err);
      }
    };

    loadSessions();
    const syncInterval = window.setInterval(loadSessions, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(syncInterval);
    };
  }, [session, currentSessionId, chatApiFetch]);

  useEffect(() => {
    if (!session) return undefined;
    let cancelled = false;
    const loadUsage = async () => {
      try {
        const res = await chatApiFetch('/usage');
        if (res.ok && !cancelled) setUsage(await res.json());
      } catch (err) {
        console.error('Usage fetch error:', err);
      }
    };
    loadUsage();
    return () => { cancelled = true; };
  }, [session, chatApiFetch]);

  useEffect(() => {
    if (!currentSessionId || !session) return;

    let cancelled = false;
    const loadMessages = async () => {
      try {
        const res = await chatApiFetch(`/history/${encodeURIComponent(currentSessionId)}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setMessages(data || []);
        }
      } catch (err) {
        console.error('Messages fetch error:', err);
      }
    };

    loadMessages();
    const syncInterval = window.setInterval(loadMessages, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(syncInterval);
    };
  }, [currentSessionId, session, chatApiFetch]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (!deleteTarget) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isDeletingSession) setDeleteTarget(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [deleteTarget, isDeletingSession]);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setAuthError(error.message);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setAuthError(error.message);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError('');
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) setAuthError(error.message);
    } catch (error) {
      setAuthError(error.message || 'Could not start Google sign-in.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if ((!input.trim() && !imageAttachment) || loading) return;

    const userMsg = input.trim();
    const attachedImage = imageAttachment;
    const displayMessage = userMsg || 'Describe this image.';
    setInput('');
    setImageAttachment(null);
    setLoading(true);
    setChatError('');
    setMessages((prev) => [...prev, { role: 'user', content: displayMessage, imageUrl: attachedImage?.dataUrl }]);

    try {
      const res = await chatApiFetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: currentSessionId,
          message: userMsg,
          image_data: attachedImage?.dataUrl || null,
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 429) {
          setMessages((prev) => {
            const rejectedIndex = prev.findLastIndex((message) => message.role === 'user' && message.content === displayMessage);
            if (rejectedIndex < 0) return prev;
            return prev.filter((_, index) => index !== rejectedIndex);
          });
        }
        throw new Error(errorData.detail || `Chat request failed (${res.status})`);
      }
      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);

      const sRes = await chatApiFetch('/sessions');
      if (sRes.ok) setSessions(await sRes.json());
      const usageRes = await chatApiFetch('/usage');
      if (usageRes.ok) setUsage(await usageRes.json());
    } catch (err) {
      console.error('Chat error:', err);
      setChatError(err.message || 'Zynora could not respond. Check the backend and AI API configuration, then try again.');
      try {
        const usageRes = await chatApiFetch('/usage');
        if (usageRes.ok) setUsage(await usageRes.json());
      } catch (usageError) {
        console.error('Usage refresh error:', usageError);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setChatError('Choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setChatError('Images must be 5 MB or smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const previewImage = new window.Image();
        previewImage.onload = () => {
          if (previewImage.naturalWidth < 32 || previewImage.naturalHeight < 32) {
            setChatError('Choose an image that is at least 32 × 32 pixels.');
            return;
          }
          setImageAttachment({ name: file.name, dataUrl: reader.result });
          setChatError('');
        };
        previewImage.onerror = () => setChatError('Could not open that image. Please choose another file.');
        previewImage.src = reader.result;
      }
    };
    reader.onerror = () => setChatError('Could not read that image. Please choose it again.');
    reader.readAsDataURL(file);
  };

  const requestDeleteSession = (e, chat) => {
    e.stopPropagation();
    setDeleteError('');
    setDeleteTarget(chat);
  };

  const deleteSession = async () => {
    if (!deleteTarget || isDeletingSession) return;
    const sessionId = deleteTarget.user_id;
    setIsDeletingSession(true);
    setDeleteError('');
    try {
      const res = await chatApiFetch(`/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete request failed (${res.status})`);
      setSessions((prev) => prev.filter(s => s.user_id !== sessionId));
      setDeleteTarget(null);
      if (currentSessionId === sessionId) {
        setCurrentSessionId("chat_" + Date.now());
        setMessages([]);
      }
    } catch (err) {
      console.error('Delete error:', err);
      setDeleteError('Could not delete this chat. Please try again.');
    } finally {
      setIsDeletingSession(false);
    }
  };

  const handleRedeemSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await chatApiFetch('/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: redeemCodeInput })
      });
      const data = await res.json();
      if (res.ok) {
        setRedeemResponse(data.message || "Success!");
        setRedeemResponseType("success");
        const usageRes = await chatApiFetch('/usage');
        if (usageRes.ok) setUsage(await usageRes.json());
      } else {
        setRedeemResponse(data.detail || "Invalid Code!");
        setRedeemResponseType("error");
      }
    } catch {
      setRedeemResponse("Server error.");
      setRedeemResponseType("error");
    }
  };

  if (authLoading) return <div className="loading-screen"><Sparkles size={30} /> <span>Preparing your space</span></div>;

  if (!session) {
    return (
      <main className="auth-shell">
        <form className="auth-panel" onSubmit={handleAuthSubmit}>
          <div className="auth-brand"><Sparkles size={30} /><span>Zynora <b>AI</b></span></div>
          <p className="auth-kicker">A clearer space to think</p>
          <h1>{isSignUp ? 'Create your account' : 'Welcome back'}</h1>
          <p className="auth-description">{isSignUp ? 'Create your personal AI workspace.' : 'Sign in to pick up where your ideas left off.'}</p>
          <button className="google-button" type="button" onClick={handleGoogleSignIn} disabled={googleLoading}>
            <span className="google-mark" aria-hidden="true">G</span>
            {googleLoading ? 'Connecting to Google...' : 'Continue with Google'}
          </button>
          <div className="auth-divider"><span>or continue with email</span></div>
          <label>Email<input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Password<input type="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          {authError && <div className="auth-error" role="alert">{authError}</div>}
          <button className="primary-button" type="submit">{isSignUp ? 'Create account' : 'Sign in'} <ArrowRight size={17} /></button>
          <button className="auth-switch" type="button" onClick={() => setIsSignUp(!isSignUp)}>
            {isSignUp ? 'Already have an account? Sign in' : "New to Zynora? Create an account"}
          </button>
        </form>
      </main>
    );
  }

  const filteredSessions = sessions.filter((item) => (item.title || item.user_id).toLowerCase().includes(searchQuery.toLowerCase()));
  const starterPrompts = [
    { title: 'Create Content', description: 'Write, blog, post, and tell your story.', icon: FileText, prompt: 'Help me create an engaging piece of content about ' },
    { title: 'Code Help', description: 'Get help with programming and tricky bugs.', icon: Code2, prompt: 'Help me with this coding task: ' },
    { title: 'Generate Images', description: 'Explore a visual idea with a clear prompt.', icon: Image, prompt: 'Help me write a detailed image prompt for ' },
    { title: 'Brainstorm Ideas', description: 'Find a fresh angle for what comes next.', icon: Lightbulb, prompt: 'Help me brainstorm ideas for ' },
  ];

  const composer = (
    <form className="composer" onSubmit={handleSendMessage}>
      <input ref={imageInputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageSelect} />
      {imageAttachment && <div className="attachment-preview"><img src={imageAttachment.dataUrl} alt={imageAttachment.name} /><span title={imageAttachment.name}>{imageAttachment.name}</span><button type="button" className="icon-button" aria-label="Remove attached image" title="Remove image" onClick={() => setImageAttachment(null)}><X size={16} /></button></div>}
      <textarea
        aria-label="Message Zynora AI"
        placeholder="Ask anything..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form.requestSubmit(); } }}
        rows={1}
      />
      <div className="composer-actions">
        <div className="composer-tools">
          <button className="round-tool" type="button" aria-label="Choose image from gallery" title="Choose image from gallery" onClick={() => imageInputRef.current?.click()}><ImagePlus size={17} /></button>
          <div className="tool-picker-wrap">
            <button className="tools-button" type="button" onClick={() => setShowTools(!showTools)} aria-expanded={showTools}>Tools <ChevronDown size={15} /></button>
            {showTools && <div className="tool-popover"><span>Try a prompt</span>{starterPrompts.slice(0, 3).map((item) => <button type="button" key={item.title} onClick={() => { setInput(item.prompt); setShowTools(false); }}>{item.title}</button>)}</div>}
          </div>
        </div>
        <button className="send-button" type="submit" disabled={loading || (!input.trim() && !imageAttachment)} aria-label="Send message" title="Send message"><Send size={18} /></button>
      </div>
    </form>
  );

  return (
    <div className={`app-shell${lightTheme ? ' theme-light' : ''}`}>
      <aside className={`sidebar${isSidebarOpen ? '' : ' sidebar-closed'}`}>
        <div className="sidebar-brand">
          <Sparkles className="brand-sparkle" size={38} strokeWidth={1.6} />
          <div><div className="brand-name">Zynora <span>AI</span></div><div className="brand-tagline">Think Deeper <i /> Create Faster</div></div>
          <button className="mobile-close icon-button" type="button" onClick={() => setIsSidebarOpen(false)} aria-label="Close sidebar"><X size={19} /></button>
        </div>

        <button className="new-chat-button" type="button" onClick={() => { setActiveView('chat'); setCurrentSessionId(`chat_${Date.now()}`); setMessages([]); setChatError(''); setInput(''); setImageAttachment(null); }}>
          <span className="new-chat-icon"><Plus size={17} /></span> New Chat
        </button>

        <section className="recents-section">
          <button className="recents-heading" type="button" onClick={() => setShowRecent(!showRecent)} aria-expanded={showRecent}>
            <span><ArrowDown size={17} /> Recent</span>{showRecent ? <ChevronRight size={17} className="chevron-down" /> : <ChevronRight size={17} />}
          </button>
          {showRecent && <div className="recents-list">
            {showSearch && <div className="recent-search"><Search size={15} /><input autoFocus placeholder="Find a chat" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>}
            {filteredSessions.map((item) => (
              <div className={`recent-row${currentSessionId === item.user_id ? ' active' : ''}`} key={item.user_id}>
                <button className="recent-card" type="button" onClick={() => { setActiveView('chat'); setCurrentSessionId(item.user_id); }} title={item.title || item.user_id}>{item.title || item.user_id}</button>
                <button className="delete-chat icon-button" type="button" onClick={(e) => requestDeleteSession(e, item)} aria-label="Delete chat" title="Delete chat"><Trash2 size={14} /></button>
              </div>
            ))}
            {filteredSessions.length === 0 && <p className="empty-recents">Your recent chats will appear here.</p>}
          </div>}
        </section>

        <div className="sidebar-footer">
          <div className="user-avatar">{session.user?.email?.[0]?.toUpperCase() || 'Z'}</div>
          <span className="user-email">{session.user?.email || 'Zynora member'}</span>
          <button className="icon-button account-menu-button" type="button" onClick={() => setShowMenu(!showMenu)} aria-label="Account menu"><MoreHorizontal size={19} /></button>
        </div>
      </aside>

      <main className="workspace">
        <div className="scene-backdrop" aria-hidden="true" />
        <header className="topbar">
          <button className="icon-button sidebar-toggle" type="button" onClick={() => setIsSidebarOpen(!isSidebarOpen)} aria-label="Toggle sidebar" title="Toggle sidebar"><Menu size={19} /></button>
          <div className="workspace-heading">
            <span className="workspace-heading-mark"><Sparkles size={17} /></span>
            <div><strong>{activeView === 'redeem' ? 'Membership' : messages.length ? (sessions.find((item) => item.user_id === currentSessionId)?.title || 'Conversation') : 'New conversation'}</strong><span>Your AI workspace</span></div>
          </div>
          <div className="topbar-actions">
            {showSearch && <label className="top-search"><Search size={16} /><input aria-label="Search chats" placeholder="Search chats" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /><button type="button" className="icon-button" onClick={() => { setShowSearch(false); setSearchQuery(''); }} aria-label="Close search"><X size={15} /></button></label>}
            <button className="icon-button top-action" type="button" onClick={() => setShowSearch(!showSearch)} aria-label="Search chats" title="Search chats"><Search size={19} /></button>
            <button className="icon-button top-action" type="button" onClick={() => setLightTheme(!lightTheme)} aria-label="Toggle theme" title="Toggle theme">{lightTheme ? <Moon size={19} /> : <Sun size={19} />}</button>
            <button className="icon-button top-action" type="button" onClick={() => setShowNotifications(!showNotifications)} aria-label="Notifications" title="Notifications"><Bell size={19} /></button>
            <button className="icon-button top-action" type="button" onClick={() => setShowMenu(!showMenu)} aria-label="More options" title="More options"><MoreHorizontal size={20} /></button>
            {showMenu && <div className="account-popover"><p className="popover-label">Account</p><button type="button" onClick={() => { setActiveView('redeem'); setShowMenu(false); }}>Redeem a code</button><button type="button" onClick={() => { handleLogout(); setShowMenu(false); }}>Log out</button></div>}
            {showNotifications && <div className="notification-popover"><p className="popover-label">Notifications</p><p>You’re all caught up.</p></div>}
          </div>
        </header>

        {activeView === 'redeem' ? (
          <section className="redeem-view">
            <div className="redeem-panel"><div className="eyebrow">ZYNORA MEMBERSHIP</div><h1>Redeem a code</h1><p>Enter your access code to unlock your membership.</p>
              <form onSubmit={handleRedeemSubmit} className="redeem-form"><input aria-label="Redeem code" placeholder="Enter your code" value={redeemCodeInput} onChange={(e) => setRedeemCodeInput(e.target.value)} /><button className="primary-button" type="submit">Redeem <ArrowRight size={16} /></button></form>
              {redeemResponse && <div className={`redeem-response ${redeemResponseType}`} role="status">{redeemResponse}</div>}
              {usage?.unlimited && <div className="membership-active">Unlimited access is active for this account</div>}
            </div>
          </section>
        ) : messages.length === 0 ? (
          <section className="home-view">
            <div className="welcome-block">
              <div className="hero-mark"><Sparkles size={70} strokeWidth={1.25} /></div>
              <h1>Hello, <span>there!</span></h1>
              <p>I’m Zynora AI, your intelligent assistant.<br />How can I help you today?</p>
            </div>
            {composer}
            {usage && <div className={`usage-status${usage.unlimited ? ' unlimited' : ''}`} role="status">{usage.unlimited ? 'Unlimited messages and image uploads' : `${Math.max(0, usage.chat_limit - usage.chat_count)} messages and ${Math.max(0, usage.image_limit - usage.image_count)} images remaining · rolling 24 hours`}</div>}
            {chatError && <div className="chat-error" role="alert">{chatError}</div>}
            <div className="starter-grid">
              {starterPrompts.map(({ title, description, icon: Icon, prompt }) => (
                <button className="starter-card" type="button" key={title} onClick={() => setInput(prompt)}>
                  <span className="starter-icon"><Icon size={19} /></span><span className="starter-title">{title}</span><span className="starter-description">{description}</span><ArrowRight className="starter-arrow" size={17} />
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="conversation-view">
            <div className="chat-messages">
              {messages.map((message, index) => (
                <article className={`chat-message ${message.role === 'user' ? 'user' : 'assistant'}`} key={`${currentSessionId}-${index}`}>
                  {message.role === 'assistant' && <div className="assistant-mark"><Sparkles size={17} /></div>}
                  <div className="message-content">
                    {message.imageUrl && <img className="message-image" src={message.imageUrl} alt="User uploaded" />}
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                  </div>
                </article>
              ))}
              {loading && <div className="thinking-indicator"><span /><span /><span /> Zynora is thinking</div>}
              {chatError && <div className="chat-error" role="alert">{chatError}</div>}
              <div ref={chatEndRef} />
            </div>
            <div className="conversation-composer">{composer}<p className={`usage-status${usage?.unlimited ? ' unlimited' : ''}`}>{usage?.unlimited ? 'Unlimited messages and image uploads' : usage ? `${Math.max(0, usage.chat_limit - usage.chat_count)} messages and ${Math.max(0, usage.image_limit - usage.image_count)} images remaining · rolling 24 hours` : 'AI can make mistakes. Check important information.'}</p></div>
          </section>
        )}
      </main>
      {deleteTarget && <div className="confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !isDeletingSession) setDeleteTarget(null); }}>
        <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-description">
          <div className="confirm-icon"><Trash2 size={20} /></div>
          <h2 id="delete-dialog-title">Delete this chat?</h2>
          <p id="delete-dialog-description">“{deleteTarget.title || deleteTarget.user_id}” will be permanently removed. This can’t be undone.</p>
          {deleteError && <p className="confirm-error" role="alert">{deleteError}</p>}
          <div className="confirm-actions">
            <button className="confirm-cancel" type="button" autoFocus disabled={isDeletingSession} onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button className="confirm-delete" type="button" disabled={isDeletingSession} onClick={deleteSession}>{isDeletingSession ? 'Deleting…' : 'Delete chat'}</button>
          </div>
        </section>
      </div>}
    </div>
  );
}

export default App;
