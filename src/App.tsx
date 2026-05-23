import React, { useState, useEffect, useRef } from 'react';
import { Compass, PlusSquare, Image as ImageIcon, Video, FileText, Send, Loader2, MessageSquare, AlertCircle, Sparkles } from 'lucide-react';

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

  // Mural Data State
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form State
  const [messageText, setMessageText] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch messages from SQLite DB
  const fetchMessages = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/messages');
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error("Error loading messages:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, []);

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
        
        // Refresh local items
        await fetchMessages();
        
        // Switch view back to Mural tab
        setActiveTab('mural');
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

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans pb-24">
      {/* Top Masthead */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 px-4 py-4">
        <div className="max-w-xl mx-auto flex flex-col items-center justify-center gap-2 text-center">
          <div className="flex items-center gap-2 justify-center">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2 font-sans justify-center">
              Stellarium Mural
            </h1>
          </div>
          <span className="text-xs text-slate-400 font-mono bg-slate-800 px-2.5 py-1 rounded-full border border-slate-700">
            {messages.length} posts
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-xl mx-auto px-4 py-6">
        
        {/* Tab 1: MURAL FEED */}
        {activeTab === 'mural' && (
          <div className="space-y-6">
            <div className="p-4 bg-slate-950/40 border border-slate-800 rounded-xl text-center">
              <p className="text-sm text-slate-300 leading-relaxed font-mono">
                🌌 Welcome to the open canvas. Anyone can append their voice, their photography, or videography here. No edits, no removals—what is posted is etched on the mural forever.
              </p>
            </div>

            {isLoading && messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                <span className="text-sm font-mono">Retrieving the mural...</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 border border-dashed border-slate-800 rounded-2xl text-slate-400 text-center p-6">
                <MessageSquare className="w-12 h-12 text-slate-600 mb-3" />
                <p className="font-semibold text-slate-200">The mural is blank</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs text-center">Be the very first to leave a permanent message, photograph, or video on this open canvas!</p>
                <button
                  onClick={() => setActiveTab('post')}
                  className="mt-4 px-4 py-2 bg-emerald-500 text-slate-950 text-xs font-bold rounded-lg hover:bg-emerald-400 transition-colors"
                >
                  Post First Message
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((item) => {
                  const isImage = item.media_mime?.startsWith('image/');
                  const isVideo = item.media_mime?.startsWith('video/');

                  return (
                    <article 
                      key={item.id} 
                      className="bg-slate-950 border border-slate-800/80 rounded-2xl p-5 shadow-xl hover:border-slate-700 transition-all flex flex-col items-center text-center gap-4 overflow-hidden"
                    >
                      {/* Media Display on demand */}
                      {item.media_mime && (
                        <div className="rounded-xl overflow-hidden bg-slate-900 border border-slate-800 flex justify-center items-center max-h-96 min-h-[140px] relative w-full">
                          {isImage && (
                            <img 
                              src={`/api/media/${item.id}`} 
                              alt={item.media_name || "Mural media"} 
                              className="object-contain max-h-96 w-full hover:scale-105 transition-transform duration-300"
                              referrerPolicy="no-referrer"
                              loading="lazy"
                            />
                          )}
                          {isVideo && (
                            <video 
                              src={`/api/media/${item.id}`} 
                              controls 
                              preload="metadata"
                              className="max-h-96 w-full object-contain"
                              playsInline
                            />
                          )}
                           {!isImage && !isVideo && (
                            <div className="p-6 text-center text-slate-300 flex flex-col items-center gap-3 w-full bg-slate-900/60 rounded-xl">
                              <FileText className="w-10 h-10 text-emerald-400 animate-pulse" />
                              <div className="flex flex-col items-center gap-1">
                                <span className="text-sm font-semibold font-mono text-slate-200 break-all max-w-xs text-center px-4">
                                  {item.media_name}
                                </span>
                                <span className="text-[11px] text-slate-500 font-mono text-center">
                                  Attached Document
                                </span>
                              </div>
                              <a 
                                href={`/api/media/${item.id}`} 
                                download={item.media_name || "download"}
                                className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono text-emerald-400 hover:text-emerald-300 hover:bg-slate-750 transition-colors inline-flex items-center gap-1.5"
                              >
                                Download Document
                              </a>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Message Content */}
                      {item.message && (
                        <p className="text-[17px] text-slate-100 font-sans tracking-wide leading-relaxed break-words whitespace-pre-wrap text-center w-full">
                          {item.message}
                        </p>
                      )}

                      {/* Post Footnote metadata */}
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-3 border-t border-slate-900/65 mt-1 text-[13px] text-center w-full">
                        <div className="flex items-center gap-1.5 text-emerald-400 font-mono font-medium justify-center">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                          {item.author}
                        </div>
                        <span className="hidden sm:inline text-slate-600">•</span>
                        <time className="text-slate-500 font-mono text-xs">
                          {new Date(item.created_at).toLocaleDateString(undefined, { 
                            month: 'short', 
                            day: 'numeric', 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </time>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: SUBMIT A POST */}
        {activeTab === 'post' && (
          <div className="space-y-6">
            <div className="flex flex-col gap-1 text-center items-center justify-center">
              <h2 className="text-xl font-bold text-white tracking-tight">Create Mural Post</h2>
              <p className="text-xs text-slate-400 text-center">Your post is fully immutable. Think twice before submitting!</p>
            </div>

            <form onSubmit={handleFormSubmit} className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-2xl flex flex-col items-center">
              
              {/* Optional Name Indicator */}
              <div className="space-y-1.5 w-full">
                <label className="text-xs text-slate-400 font-mono uppercase tracking-wider block text-center">
                  Author Pen Name
                </label>
                <input 
                  type="text"
                  maxLength={50}
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Anonymous (or your name)"
                  disabled={isUploading}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-sm font-sans text-center"
                />
              </div>

              {/* Message Payload Body */}
              <div className="space-y-1.5 w-full">
                <label className="text-xs text-slate-400 font-mono uppercase tracking-wider block text-center">
                  Message Content
                </label>
                <textarea
                  maxLength={1000}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Leave your mark on the mural..."
                  disabled={isUploading}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-emerald-500  focus:border-transparent outline-none transition-all text-sm h-36 resize-none font-sans text-center"
                />
              </div>

              {/* Upload Attachment Selector */}
              <div className="space-y-2 w-full flex flex-col items-center justify-center">
                <label className="text-xs text-slate-400 font-mono uppercase tracking-wider block text-center">
                  Attach Photo, Video, or Document (Max 25MB)
                </label>
                
                <div className="flex flex-col items-center gap-2 justify-center">
                  <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-850 hover:border-slate-700 text-xs font-mono text-slate-300 transition-all select-none cursor-pointer"
                  >
                    <PlusSquare className="w-4 h-4 text-emerald-400" />
                    <span>Choose File...</span>
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
              {previewUrl && selectedFile && (
                <div className="mt-4 p-3 bg-slate-900/50 rounded-xl border border-slate-800 space-y-2 w-full">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-mono flex items-center gap-1.5 text-[11px]">
                      {selectedFile.type.startsWith('image/') ? (
                        <ImageIcon size={14} className="text-emerald-400" />
                      ) : selectedFile.type.startsWith('video/') ? (
                        <Video size={14} className="text-emerald-400" />
                      ) : (
                        <FileText size={14} className="text-emerald-400" />
                      )}
                      Attachment Preview ({Math.round(selectedFile.size / 1024 / 1024 * 100) / 100} MB)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        setPreviewUrl(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="text-red-400 hover:underline cursor-pointer text-[11px]"
                    >
                      Remove
                    </button>
                  </div>
                  
                  <div className="rounded-lg overflow-hidden border border-slate-800 bg-slate-950 flex max-h-48 justify-center items-center w-full">
                    {selectedFile.type.startsWith('image/') ? (
                       <img src={previewUrl} className="object-contain max-h-48" alt="Local preview" />
                    ) : selectedFile.type.startsWith('video/') ? (
                      <video src={previewUrl} className="object-contain max-h-48" controls />
                    ) : (
                      <div className="p-6 text-center text-slate-400 font-mono text-xs flex flex-col items-center justify-center gap-2 w-full bg-slate-900/40">
                        <FileText className="w-8 h-8 text-emerald-400 animate-bounce" />
                        <span className="bg-slate-800 text-slate-200 border border-slate-700 rounded px-2.5 py-1 text-[11px] break-all max-w-[200px] block text-center">
                          {selectedFile.name}
                        </span>
                        <span>Selected Document Ready</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Local errors display */}
              {errorMessage && (
                <div className="flex items-start gap-2 bg-red-950/40 border border-red-900/60 text-red-300 p-3 rounded-xl text-xs font-mono w-full text-center justify-center">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Submit Post trigger */}
              <button
                type="submit"
                disabled={isUploading}
                className="w-full bg-emerald-500 text-slate-950 py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-400 transition-all select-none disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Uploading attachment & writing state...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Engrave message on Mural</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </main>

      {/* Floating Bottom Navigator */}
      <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-800 bg-slate-950/95 backdrop-blur-lg py-2.5 px-6 z-50 shadow-[0_-10px_25px_rgba(0,0,0,0.5)]">
        <div className="max-w-md mx-auto flex justify-around items-center">
          
          {/* Tab: Mural */}
          <button
            onClick={() => setActiveTab('mural')}
            className={`flex flex-col items-center gap-1 py-1.5 px-5 rounded-xl transition-all cursor-pointer ${
              activeTab === 'mural' 
                ? 'text-emerald-400' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Compass className={`w-6 h-6 transition-transform duration-300 ${activeTab === 'mural' ? 'scale-110 text-emerald-400' : ''}`} />
            <span className="text-[11px] font-mono tracking-wider uppercase font-semibold">Mural</span>
          </button>

          {/* Tab: Post */}
          <button
            onClick={() => setActiveTab('post')}
            className={`flex flex-col items-center gap-1 py-1.5 px-5 rounded-xl transition-all cursor-pointer ${
              activeTab === 'post' 
                ? 'text-emerald-400' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <PlusSquare className={`w-6 h-6 transition-transform duration-300 ${activeTab === 'post' ? 'scale-110 text-emerald-400' : ''}`} />
            <span className="text-[11px] font-mono tracking-wider uppercase font-semibold">Post</span>
          </button>
          
        </div>
      </nav>
    </div>
  );
}
