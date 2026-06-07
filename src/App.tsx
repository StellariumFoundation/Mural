import React, { useState, useEffect, useRef } from 'react';
import { Compass, PlusSquare, Image as ImageIcon, Video, FileText, Send, Loader2, MessageSquare, AlertCircle, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Message {
  id: number;
  message: string;
  author: string;
  media_mime: string | null;
  media_name: string | null;
  created_at: string;
}

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<'mural' | 'post'>('mural');
  const scrollPositions = useRef<Record<'mural' | 'post', number>>({ mural: 0, post: 0 });

  const switchTab = (newTab: 'mural' | 'post') => {
    scrollPositions.current[activeTab] = window.scrollY;
    setActiveTab(newTab);
  };

  useEffect(() => {
    const savedPos = scrollPositions.current[activeTab];
    const frameId = requestAnimationFrame(() => {
      window.scrollTo(0, savedPos);
    });
    return () => cancelAnimationFrame(frameId);
  }, [activeTab]);

  // Mural Data State
  const [messages, setMessages] = useState<Message[]>([]);
  const [totalPosts, setTotalPosts] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);

  // Form State
  const [messageText, setMessageText] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch messages from SQLite DB
  const fetchMessages = async (pageNum: number = 1, append: boolean = false) => {
    try {
      if (pageNum === 1) setIsLoading(true);
      else setIsFetchingMore(true);

      const [res, countRes] = await Promise.all([
        fetch(`/api/messages?page=${pageNum}`),
        fetch('/api/messages/count')
      ]);

      if (countRes.ok) {
        const countData = await countRes.json();
        setTotalPosts(countData.count);
      }

      if (res.ok) {
        const data = await res.json();
        if (append) {
          setMessages(prev => [...prev, ...data.messages]);
        } else {
          setMessages(data.messages);
        }
        setHasMore(data.hasMore);
        setPage(pageNum);
      }
    } catch (err) {
      console.error("Error loading messages:", err);
    } finally {
      setIsLoading(false);
      setIsFetchingMore(false);
    }
  };

  useEffect(() => {
    fetchMessages(1);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !isFetchingMore && !isLoading && activeTab === 'mural') {
          fetchMessages(page + 1, true);
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, isFetchingMore, isLoading, page, activeTab]);

  // Handle selected file validation and display preview URL
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }

    // 25 MB max limit
    const maxSize = 25 * 1024 * 1024;
    if (file.size > maxSize) {
      setErrorMessage("File exceeds 25MB limit. Please select a lighter file.");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  // Perform lightweight POST using native FormData
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!messageText.trim() && !selectedFile) {
      setErrorMessage("Write a message or upload an image/video to post!");
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append("message", messageText.trim());
      formData.append("author", authorName.trim() || "Anonymous");
      if (selectedFile) {
        formData.append("file", selectedFile);
      }

      const res = await fetch('/api/messages', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        // Clear input form
        setMessageText('');
        setAuthorName('');
        setSelectedFile(null);
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
          setPreviewUrl(null);
        }
        if (fileInputRef.current) fileInputRef.current.value = "";
        
        // Refresh local items (back to page 1)
        await fetchMessages(1);
        
        // Reset scroll position of mural to 0 to show the new post at the top
        scrollPositions.current['mural'] = 0;
        switchTab('mural');
      } else {
        const errData = await res.json();
        setErrorMessage(errData.error || "Failed to submit post.");
      }
    } catch (err) {
      setErrorMessage("Network error occurred. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans pb-24 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.15),rgba(255,255,255,0))]">
      {/* Top Masthead */}
      <header className="border-b border-slate-800 bg-slate-950 sticky top-0 z-40 px-4 py-4">
        <div className="max-w-6xl mx-auto flex flex-col items-center justify-center gap-2 text-center">
          <div className="flex items-center gap-2 justify-center">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)] animate-pulse"></span>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2 font-sans justify-center bg-clip-text text-transparent bg-gradient-to-br from-white to-slate-400">
              Stellarium Mural
            </h1>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            key={totalPosts}
            className="text-[10px] text-emerald-400 font-mono bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-900/50"
          >
            {totalPosts} POSTS INDEXED
          </motion.div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-[95vw] mx-auto px-4 py-8">
        {/* Tab 1: MURAL FEED */}
        <div
          className={`space-y-6 ${activeTab === 'mural' ? 'block' : 'hidden'}`}
        >
          <div className="max-w-2xl mx-auto p-5 bg-slate-950/40 border border-slate-800/80 rounded-2xl text-center shadow-lg backdrop-blur-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
            <p className="text-[13px] text-slate-300 leading-relaxed font-mono relative z-10">
              🌌 Welcome to the open canvas. Anyone can append their voice, photography, or videography here. No edits, no removals—what is posted is etched on the mural forever.
            </p>
          </div>

          {isLoading && messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-4 text-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              >
                <Loader2 className="w-8 h-8 text-emerald-500" />
              </motion.div>
              <span className="text-sm font-mono tracking-widest text-emerald-500/70 uppercase">Retrieving the mural...</span>
            </div>
          ) : messages.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-20 border border-dashed border-slate-800 rounded-3xl text-slate-400 text-center p-6 bg-slate-950/30"
            >
              <MessageSquare className="w-12 h-12 text-slate-600 mb-4" />
              <p className="font-semibold text-slate-200">The mural is blank</p>
              <p className="text-xs text-slate-400 mt-2 max-w-xs text-center leading-relaxed">Be the very first to leave a permanent message, photograph, or video on this open canvas.</p>
              <button
                onClick={() => switchTab('post')}
                className="mt-6 px-6 py-2.5 bg-emerald-500 text-slate-950 text-xs font-bold rounded-xl hover:bg-emerald-400 hover:shadow-[0_0_15px_rgba(16,185,129,0.4)] transition-all uppercase tracking-wider"
              >
                Post First Message
              </button>
            </motion.div>
          ) : (
            <motion.div 
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[3vw] items-start w-full"
            >
              <AnimatePresence>
                {messages.map((item) => {
                  const isImage = item.media_mime?.startsWith('image/');
                  const isVideo = item.media_mime?.startsWith('video/');

                  return (
                    <motion.article 
                      variants={itemVariants}
                      layout
                      key={item.id} 
                      className="bg-slate-950/80 border border-slate-800/80 rounded-[4vw] md:rounded-[2vw] lg:rounded-[1.5vw] p-[5vw] md:p-[3vw] lg:p-[2vw] shadow-xl hover:border-emerald-500/30 hover:shadow-emerald-500/10 hover:bg-slate-900/90 transition-all flex flex-col items-center text-center gap-[4vw] md:gap-[2vw] lg:gap-[1.5vw] overflow-hidden backdrop-blur-sm group group-hover:duration-200 w-full"
                    >
                        {/* Media Display on demand */}
                        {item.media_mime && (
                          <div className="rounded-[3vw] md:rounded-[1.5vw] lg:rounded-[1vw] overflow-hidden bg-black/40 border border-slate-800/80 flex justify-center items-center h-[55vw] md:h-[35vw] lg:h-[22vw] relative w-full group-hover:border-slate-700 transition-colors">
                            {isImage && (
                              <img 
                                src={`/api/media/${item.id}`} 
                                alt={item.media_name || "Mural media"} 
                                className="object-cover w-full h-full hover:scale-105 transition-transform duration-500"
                                referrerPolicy="no-referrer"
                                loading="lazy"
                              />
                            )}
                            {isVideo && (
                              <video 
                                src={`/api/media/${item.id}`} 
                                controls 
                                preload="metadata"
                                className="w-full h-full object-cover"
                                playsInline
                              />
                            )}
                             {!isImage && !isVideo && (
                              <div className="p-[4vw] md:p-[2vw] text-center text-slate-300 flex flex-col items-center justify-center gap-[2vw] md:gap-[1vw] w-full h-full">
                                <FileText className="w-[8vw] h-[8vw] md:w-[4vw] md:h-[4vw] text-emerald-400 group-hover:scale-110 transition-transform duration-300 animate-pulse" />
                                <div className="flex flex-col items-center gap-[1vw] md:gap-[0.5vw]">
                                  <span className="text-[3.2vw] md:text-[1.2vw] font-semibold font-mono text-slate-200 break-all max-w-[90%] text-center px-2">
                                    {item.media_name}
                                  </span>
                                  <span className="text-[2.2vw] md:text-[0.9vw] text-slate-500 font-mono text-center tracking-wider uppercase">
                                    Attached Document
                                  </span>
                                </div>
                                <a 
                                  href={`/api/media/${item.id}`} 
                                  download={item.media_name || "download"}
                                  className="mt-[1vw] px-[3vw] py-[1.5vw] md:px-[1.5vw] md:py-[0.8vw] bg-slate-800 border border-slate-700 rounded-[1.5vw] md:rounded-[0.8vw] text-[2.2vw] md:text-[0.9vw] font-mono text-emerald-400 hover:text-emerald-300 hover:bg-slate-700 hover:border-emerald-500/30 transition-all inline-flex items-center gap-2 shadow-sm"
                                >
                                  Download File
                                </a>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Message Content */}
                        {item.message && (
                          <p className="text-[4.2vw] md:text-[2.2vw] lg:text-[1.15vw] text-slate-200 font-sans tracking-wide leading-relaxed break-words whitespace-pre-wrap text-center w-full px-[1vw]">
                            {item.message}
                          </p>
                        )}

                        {/* Post Footnote metadata */}
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-[2vw] md:gap-[1vw] pt-[3vw] md:pt-[1.5vw] border-t border-slate-800/60 w-full mt-2 text-[3vw] md:text-[1.3vw] lg:text-[0.85vw] text-center">
                          <div className="flex items-center gap-[1.5vw] md:gap-[0.5vw] text-emerald-400 font-mono font-medium justify-center">
                            <span className="w-[1.5vw] h-[1.5vw] md:w-[0.6vw] md:h-[0.6vw] bg-emerald-500 rounded-full shadow-[0_0_5px_rgba(16,185,129,0.8)]"></span>
                            {item.author}
                          </div>
                          <span className="hidden sm:inline text-slate-700 font-black">•</span>
                          <time className="text-slate-500 font-mono text-[2.8vw] md:text-[1.2vw] lg:text-[0.75vw] tracking-wider uppercase">
                            {new Date(item.created_at).toLocaleDateString(undefined, { 
                              month: 'short', 
                              day: 'numeric', 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </time>
                        </div>
                    </motion.article>
                  );
                })}
              </AnimatePresence>

              {/* Loading spinner at the bottom */}
              <div ref={observerTarget} className="py-8 flex justify-center w-full md:col-span-2 lg:col-span-3">
                {isFetchingMore && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 text-emerald-500 bg-emerald-950/20 px-4 py-2 rounded-full border border-emerald-900/30"
                  >
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-[11px] font-mono tracking-widest uppercase">Loading Archives...</span>
                  </motion.div>
                )}
                {!hasMore && messages.length > 0 && !isLoading && (
                  <div className="flex items-center gap-2 text-slate-500 font-mono text-[11px] tracking-widest uppercase">
                    <span className="w-8 h-px bg-slate-800 block"></span>
                    End of Mural
                    <span className="w-8 h-px bg-slate-800 block"></span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>

        {/* Tab 2: SUBMIT A POST */}
        <div
          className={`space-y-6 max-w-xl mx-auto ${activeTab === 'post' ? 'block' : 'hidden'}`}
        >
              <div className="flex flex-col gap-2 text-center items-center justify-center">
                <h2 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-200">Create Mural Post</h2>
                <p className="text-xs text-slate-400 text-center font-mono uppercase tracking-wider">Your post is fully immutable. Think twice before submitting!</p>
              </div>

              <form onSubmit={handleFormSubmit} className="bg-slate-950/80 backdrop-blur-md border border-slate-800 rounded-3xl p-7 space-y-6 shadow-2xl flex flex-col items-center">
                
                {/* Optional Name Indicator */}
                <div className="space-y-2 w-full">
                  <label className="text-[11px] text-slate-400 font-mono uppercase tracking-widest block text-center">
                    Author Pen Name
                  </label>
                  <input 
                    type="text"
                    maxLength={50}
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                    placeholder="Anonymous (or your name)"
                    disabled={isUploading}
                    className="w-full bg-slate-900/50 border border-slate-800/80 rounded-xl px-4 py-3.5 text-slate-100 placeholder-slate-600 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 outline-none transition-all text-sm font-sans text-center shadow-inner"
                  />
                </div>

                {/* Message Payload Body */}
                <div className="space-y-2 w-full">
                  <label className="text-[11px] text-slate-400 font-mono uppercase tracking-widest block text-center">
                    Message Content
                  </label>
                  <textarea
                    maxLength={1000}
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Leave your mark on the mural..."
                    disabled={isUploading}
                    className="w-full bg-slate-900/50 border border-slate-800/80 rounded-xl p-4 text-slate-100 placeholder-slate-600 focus:ring-2 focus:ring-emerald-500/50  focus:border-emerald-500/50 outline-none transition-all text-sm h-36 resize-none font-sans text-center shadow-inner"
                  />
                </div>

                {/* Upload Attachment Selector */}
                <div className="space-y-3 w-full flex flex-col items-center justify-center pt-2">
                  <label className="text-[11px] text-slate-400 font-mono uppercase tracking-widest block text-center">
                    Attach Media (Max 25MB)
                  </label>
                  
                  <div className="flex flex-col items-center gap-3 justify-center">
                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center justify-center gap-2.5 px-6 py-3.5 bg-slate-900 border border-slate-700/80 rounded-xl hover:bg-slate-800 hover:border-slate-600 text-xs font-mono text-emerald-400 hover:text-emerald-300 transition-all shadow-md group cursor-pointer"
                    >
                      <PlusSquare className="w-4 h-4 group-hover:scale-110 transition-transform" />
                      <span className="tracking-wider uppercase">Choose File...</span>
                    </button>
                    <span className="text-[11px] text-slate-500 font-mono truncate max-w-[200px] text-center block">
                      {selectedFile ? selectedFile.name : "No file attached"}
                    </span>
                  </div>

                  <input 
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*,video/*,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/zip,application/x-zip-compressed"
                    disabled={isUploading}
                    className="hidden"
                  />
                </div>

                {/* Preview Section if file selected */}
                <AnimatePresence>
                  {previewUrl && selectedFile && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 space-y-3 w-full overflow-hidden"
                    >
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-mono flex items-center gap-2 text-[11px] tracking-wider uppercase">
                          {selectedFile.type.startsWith('image/') ? (
                            <ImageIcon size={14} className="text-emerald-400" />
                          ) : selectedFile.type.startsWith('video/') ? (
                            <Video size={14} className="text-emerald-400" />
                          ) : (
                            <FileText size={14} className="text-emerald-400" />
                          )}
                          Preview ({Math.round(selectedFile.size / 1024 / 1024 * 100) / 100} MB)
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFile(null);
                            setPreviewUrl(null);
                            if (fileInputRef.current) fileInputRef.current.value = "";
                          }}
                          className="text-red-400 hover:text-red-300 font-mono text-[11px] tracking-widest uppercase transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                      
                      <div className="rounded-xl overflow-hidden border border-slate-800 bg-black/40 flex max-h-56 justify-center items-center w-full relative">
                        {selectedFile.type.startsWith('image/') ? (
                           <img src={previewUrl} className="object-contain max-h-56 w-full" alt="Local preview" />
                        ) : selectedFile.type.startsWith('video/') ? (
                          <video src={previewUrl} className="object-contain max-h-56 w-full" controls />
                        ) : (
                          <div className="p-8 text-center text-slate-400 font-mono text-xs flex flex-col items-center justify-center gap-3 w-full h-full bg-slate-900/20">
                            <FileText className="w-10 h-10 text-emerald-400 animate-pulse" />
                            <span className="bg-slate-950 text-slate-300 border border-slate-800 rounded-lg px-3 py-1.5 text-[11px] break-all max-w-[250px] block text-center shadow-inner">
                              {selectedFile.name}
                            </span>
                            <span className="uppercase tracking-widest text-[10px] text-emerald-500/70">Document Ready</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Local errors display */}
                <AnimatePresence>
                  {errorMessage && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="flex items-center gap-2 bg-red-950/40 border border-red-900/60 text-red-300 p-3.5 rounded-xl text-xs font-mono w-full text-center justify-center"
                    >
                      <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
                      <span className="uppercase tracking-wide text-[11px]">{errorMessage}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit Post trigger */}
                <button
                  type="submit"
                  disabled={isUploading}
                  className="w-full bg-emerald-500 text-slate-950 py-4 px-4 rounded-xl font-bold flex items-center justify-center gap-2.5 hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all select-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none text-[13px] uppercase tracking-wider relative overflow-hidden group"
                >
                  <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:animate-[shimmer_1.5s_infinite]"></div>
                  {isUploading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin text-slate-950" />
                      <span>Writing to Database...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Engrave on Mural</span>
                    </>
                  )}
              </button>
            </form>
          </div>
      </main>

      {/* Floating Bottom Navigator */}
      <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-800 bg-slate-950 py-3 px-6 z-50">
        <div className="max-w-md mx-auto flex justify-around items-center">
          
          {/* Tab: Mural */}
          <button
            onClick={() => switchTab('mural')}
            className={`flex flex-col items-center gap-1.5 py-1.5 px-6 rounded-2xl transition-all duration-300 cursor-pointer ${
              activeTab === 'mural' 
                ? 'text-emerald-400 bg-emerald-950/30 shadow-[0_0_15px_rgba(16,185,129,0.1)] border border-emerald-900/30' 
                : 'text-slate-500 hover:text-slate-300 border border-transparent'
            }`}
          >
            <Compass className={`w-6 h-6 transition-transform duration-300 ${activeTab === 'mural' ? 'scale-110 text-emerald-400' : ''}`} />
            <span className="text-[10px] font-mono tracking-widest uppercase font-semibold">Mural</span>
          </button>

          {/* Tab: Post */}
          <button
            onClick={() => switchTab('post')}
            className={`flex flex-col items-center gap-1.5 py-1.5 px-6 rounded-2xl transition-all duration-300 cursor-pointer ${
              activeTab === 'post' 
                ? 'text-emerald-400 bg-emerald-950/30 shadow-[0_0_15px_rgba(16,185,129,0.1)] border border-emerald-900/30' 
                : 'text-slate-500 hover:text-slate-300 border border-transparent'
            }`}
          >
            <PlusSquare className={`w-6 h-6 transition-transform duration-300 ${activeTab === 'post' ? 'scale-110 text-emerald-400' : ''}`} />
            <span className="text-[10px] font-mono tracking-widest uppercase font-semibold">Post</span>
          </button>
          
        </div>
      </nav>
    </div>
  );
}
