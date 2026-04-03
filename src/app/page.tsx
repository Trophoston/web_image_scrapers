'use client';

import { useState, useEffect } from 'react';
import { Download, Copy, Image as ImageIcon, DownloadCloud, Loader2, Clock, X, Trash2, CheckCircle2, Files } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export default function Home() {
  const [url, setUrl] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [selectedImages, setSelectedImages] = useState<Set<number>>(new Set());

  useEffect(() => {
    const saved = localStorage.getItem('scrape_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(''), 3000);
  };

  const removeHistoryItem = (e: React.MouseEvent, targetUrl: string) => {
    e.stopPropagation();
    setHistory(prev => {
      const newHistory = prev.filter(h => h !== targetUrl);
      localStorage.setItem('scrape_history', JSON.stringify(newHistory));
      return newHistory;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('scrape_history');
  };

  const performSearch = async (targetUrl: string) => {
    if (!targetUrl) return;

    setLoading(true);
    setError('');
    setImages([]);
    setSelectedImages(new Set());
    setUrl(targetUrl);

    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to scrape');
      }

      setImages(data.images);
      
      setHistory(prev => {
        const newHistory = [targetUrl, ...prev.filter(h => h !== targetUrl)].slice(0, 5);
        localStorage.setItem('scrape_history', JSON.stringify(newHistory));
        return newHistory;
      });

      if (data.images.length === 0) {
        showToast('No images found on this page');
      } else {
        showToast(`Found ${data.images.length} images!`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handeScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(url);
  };

  const handleCopy = async (imageUrl: string) => {
    try {
      await navigator.clipboard.writeText(imageUrl);
      showToast('Image URL copied to clipboard!');
    } catch (err) {
      showToast('Failed to copy URL');
    }
  };

  const handleDownloadSingle = async (imageUrl: string, index: number) => {
    try {
       const res = await fetch(`/api/proxy?url=${encodeURIComponent(imageUrl)}`);
       if (!res.ok) throw new Error('Failed to fetch image');
       const blob = await res.blob();
       
       let ext = 'jpg';
       const contentType = res.headers.get('content-type');
       if (contentType) {
         if (contentType.includes('png')) ext = 'png';
         else if (contentType.includes('gif')) ext = 'gif';
         else if (contentType.includes('svg')) ext = 'svg';
         else if (contentType.includes('webp')) ext = 'webp';
       }

       saveAs(blob, `scraped-image-${index + 1}.${ext}`);
    } catch (err) {
      // Fallback
      const a = document.createElement('a');
      a.href = imageUrl;
      a.download = `image-${index + 1}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleDownloadZip = async (indicesToDownload: number[]) => {
    if (indicesToDownload.length === 0) return;
    setDownloadingAll(true);
    showToast(`Packaging ${indicesToDownload.length} images into ZIP...`);
    
    try {
      const zip = new JSZip();
      const folder = zip.folder("scraped-images");
      if (!folder) throw new Error("Could not create folder");

      const promises = indicesToDownload.map(async (idx) => {
        try {
          const imageUrl = images[idx];
          const res = await fetch(`/api/proxy?url=${encodeURIComponent(imageUrl)}`);
          if (!res.ok) throw new Error(`Failed: ${res.status}`);
          const blob = await res.blob();
          
          let ext = 'jpg';
          const contentType = res.headers.get('content-type');
          if (contentType) {
            if (contentType.includes('png')) ext = 'png';
            else if (contentType.includes('gif')) ext = 'gif';
            else if (contentType.includes('svg')) ext = 'svg';
            else if (contentType.includes('webp')) ext = 'webp';
          }

          folder.file(`image-${idx + 1}.${ext}`, blob);
        } catch (e) {
          console.error(`Skipping image ${idx + 1} due to error`);
        }
      });

      await Promise.allSettled(promises);
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "scraped-images.zip");
      showToast('ZIP Download complete!');
    } catch (error) {
       showToast('Failed to download ZIP');
    } finally {
      setDownloadingAll(false);
      setSelectedImages(new Set());
    }
  };

  const handleDownloadSeparate = async (indicesToDownload: number[]) => {
    if (indicesToDownload.length === 0) return;
    setDownloadingAll(true);
    showToast(`Downloading ${indicesToDownload.length} images... Check your downloads bar.`);

    for (const idx of indicesToDownload) {
      await handleDownloadSingle(images[idx], idx);
      // small delay to prevent browser anti-spam blocks
      await new Promise(r => setTimeout(r, 400));
    }
    setDownloadingAll(false);
    setSelectedImages(new Set());
    showToast('Downloads generated!');
  };

  const toggleSelection = (idx: number) => {
    setSelectedImages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(idx)) newSet.delete(idx);
      else newSet.add(idx);
      return newSet;
    });
  };

  return (
    <main>
      <header className="header">
        <h1 className="header-title">Image Scraper V2</h1>
        <p className="header-subtitle">Extract beautiful high-resolution images from any website in seconds. Create your inspiration boards magically.</p>
        
        <form className="search-form" onSubmit={handeScrape}>
          <input 
            type="url" 
            placeholder="https://example.com" 
            className="search-input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
          <button type="submit" className="search-btn" disabled={loading}>
            {loading ? <div className="spinner"></div> : 'Scrape URLs'}
          </button>
        </form>
        
        {history.length > 0 && (
          <div className="history-wrapper">
            <div className="history-container">
              {history.map((h, i) => (
                 <button key={i} className="history-pill" onClick={() => performSearch(h)} type="button">
                   <Clock size={12} className="history-icon" />
                   {h.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                   <div 
                     className="history-pill-delete" 
                     onClick={(e) => removeHistoryItem(e, h)}
                     title="Remove from history"
                   >
                     <X size={12} />
                   </div>
                 </button>
              ))}
            </div>
            <button className="clear-history-btn" onClick={clearHistory} type="button">
               <Trash2 size={12} />
               Clear History
            </button>
          </div>
        )}

        {error && <p className="error-message">{error}</p>}
      </header>

      {images.length > 0 && (
        <div className="global-actions-toolbar">
           {selectedImages.size > 0 ? (
             <>
               <span className="selected-count">{selectedImages.size} Selected</span>
               <button className="download-btn zip-btn" onClick={() => handleDownloadZip(Array.from(selectedImages))} disabled={downloadingAll}>
                 {downloadingAll ? <Loader2 className="spinner" size={16} /> : <DownloadCloud size={16} />}
                 ZIP
               </button>
               <button className="download-btn separate-btn" onClick={() => handleDownloadSeparate(Array.from(selectedImages))} disabled={downloadingAll}>
                 {downloadingAll ? <Loader2 className="spinner" size={16} /> : <Files size={16} />}
                 Separate
               </button>
               <button className="clear-selection-btn" onClick={() => setSelectedImages(new Set())}>Clear</button>
             </>
           ) : (
             <>
               <button className="download-btn zip-btn" onClick={() => handleDownloadZip(images.map((_, i) => i))} disabled={downloadingAll}>
                 {downloadingAll ? <Loader2 className="spinner" size={16} /> : <DownloadCloud size={16} />}
                 Download All as ZIP
               </button>
               <button className="download-btn separate-btn" onClick={() => handleDownloadSeparate(images.map((_, i) => i))} disabled={downloadingAll}>
                 {downloadingAll ? <Loader2 className="spinner" size={16} /> : <Files size={16} />}
                 Download All Separate
               </button>
             </>
           )}
        </div>
      )}

      {images.length === 0 && !loading && !error && (
        <div className="empty-state">
           <ImageIcon size={64} />
           <h2>Enter a URL to get started</h2>
           <p>We'll sniff out the images and lay them out gracefully.</p>
        </div>
      )}

      {images.length > 0 && (
        <div className="masonry-grid">
          {images.map((img, idx) => (
            <div className={`masonry-item ${selectedImages.has(idx) ? 'selected' : ''}`} key={idx} onClick={() => toggleSelection(idx)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt={`Scraped ${idx}`} className="masonry-image" loading="lazy" />
              
              <div className="selection-indicator">
                 {selectedImages.has(idx) ? <CheckCircle2 className="check-icon active" size={22} /> : <div className="check-circle-empty" />}
              </div>

              <div className="masonry-overlay">
                 <div className="actions" onClick={e => e.stopPropagation()}>
                    <button className="action-btn" title="Copy Image URL" onClick={() => handleCopy(img)}>
                       <Copy size={16} />
                    </button>
                    <button className="action-btn" title="Download Image" onClick={() => handleDownloadSingle(img, idx)}>
                       <Download size={16} />
                    </button>
                 </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <footer className="footer">
        <p>Built with Next.js • Credits to <a href="https://instagram.com/trophoston" target="_blank" rel="noopener noreferrer">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline', verticalAlign: 'middle', marginRight: '4px'}}>
            <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
            <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
          </svg>
          @trophoston</a></p>
      </footer>

      {toast && (
        <div className="toast">{toast}</div>
      )}
    </main>
  );
}
