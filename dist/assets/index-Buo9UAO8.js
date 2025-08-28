(function(){const s=document.createElement("link").relList;if(s&&s.supports&&s.supports("modulepreload"))return;for(const t of document.querySelectorAll('link[rel="modulepreload"]'))n(t);new MutationObserver(t=>{for(const e of t)if(e.type==="childList")for(const r of e.addedNodes)r.tagName==="LINK"&&r.rel==="modulepreload"&&n(r)}).observe(document,{childList:!0,subtree:!0});function a(t){const e={};return t.integrity&&(e.integrity=t.integrity),t.referrerPolicy&&(e.referrerPolicy=t.referrerPolicy),t.crossOrigin==="use-credentials"?e.credentials="include":t.crossOrigin==="anonymous"?e.credentials="omit":e.credentials="same-origin",e}function n(t){if(t.ep)return;t.ep=!0;const e=a(t);fetch(t.href,e)}})();class E{constructor(){this.PNG_SIGNATURE=new Uint8Array([137,80,78,71,13,10,26,10]),this.JPEG_SIGNATURE=new Uint8Array([255,216]),this.worker=null,this.workerPool=[],this.poolSize=Math.min(navigator.hardwareConcurrency||4,4)}async init(){const s=`
            class OptimizedHashWorker {
                constructor() {
                    this.PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
                    this.JPEG_SIGNATURE = new Uint8Array([0xFF, 0xD8]);
                    // Pre-generate CRC table once for better performance
                    this.crcTable = this.makeCRCTable();
                    // Pre-computed hex lookup table
                    this.hexLookup = [];
                    for (let i = 0; i < 256; i++) {
                        this.hexLookup[i] = i.toString(16).padStart(2, '0');
                    }
                }

                // Optimized hex conversion using pre-computed lookup table
                bytesToHex(bytes) {
                    let result = '';
                    for (let i = 0; i < bytes.length; i++) {
                        result += this.hexLookup[bytes[i]];
                    }
                    return result;
                }

                async sha256(data) {
                    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                    const hashArray = new Uint8Array(hashBuffer);
                    return this.bytesToHex(hashArray);
                }

                async sha512(data) {
                    const hashBuffer = await crypto.subtle.digest('SHA-512', data);
                    const hashArray = new Uint8Array(hashBuffer);
                    return this.bytesToHex(hashArray);
                }

                createPNGChunk(chunkType, data) {
                    const length = new ArrayBuffer(4);
                    new DataView(length).setUint32(0, data.length, false);
                    
                    const chunk = new Uint8Array(chunkType.length + data.length);
                    chunk.set(chunkType, 0);
                    chunk.set(data, chunkType.length);
                    
                    const crc = this.calculateCRC32(chunk);
                    const crcBuffer = new ArrayBuffer(4);
                    new DataView(crcBuffer).setUint32(0, crc, false);
                    
                    const result = new Uint8Array(4 + chunk.length + 4);
                    result.set(new Uint8Array(length), 0);
                    result.set(chunk, 4);
                    result.set(new Uint8Array(crcBuffer), 4 + chunk.length);
                    
                    return result;
                }

                calculateCRC32(data) {
                    let crc = 0xFFFFFFFF;
                    
                    for (let i = 0; i < data.length; i++) {
                        crc = this.crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
                    }
                    
                    return (crc ^ 0xFFFFFFFF) >>> 0;
                }

                makeCRCTable() {
                    if (this.crcTable) return this.crcTable;
                    
                    this.crcTable = new Array(256);
                    for (let n = 0; n < 256; n++) {
                        let c = n;
                        for (let k = 0; k < 8; k++) {
                            c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
                        }
                        this.crcTable[n] = c;
                    }
                    return this.crcTable;
                }

                parsePNGChunks(content) {
                    const chunks = [];
                    let pos = 8;

                    while (pos < content.length) {
                        const length = new DataView(content.buffer, content.byteOffset + pos).getUint32(0, false);
                        const chunkType = content.slice(pos + 4, pos + 8);
                        
                        if (!this.arraysEqual(chunkType, new Uint8Array([73, 69, 78, 68]))) { // Not IEND
                            chunks.push(content.slice(pos, pos + 8 + length + 4));
                        }

                        pos += 8 + length + 4;
                    }

                    return chunks;
                }

                addJPEGComment(content, comment) {
                    let insertPos = 2;
                    
                    while (insertPos < content.length - 1) {
                        if (content[insertPos] === 0xFF) {
                            const marker = content[insertPos + 1];
                            if (marker === 0xDA) break;
                            
                            if (marker >= 0xE0 && marker <= 0xEF) {
                                const segmentLength = (content[insertPos + 2] << 8) | content[insertPos + 3];
                                insertPos += 2 + segmentLength;
                            } else {
                                break;
                            }
                        } else {
                            insertPos++;
                        }
                    }

                    const commentData = new TextEncoder().encode(comment);
                    const segmentLength = commentData.length + 2;
                    const commentSegment = new Uint8Array(4 + commentData.length);
                    
                    commentSegment[0] = 0xFF;
                    commentSegment[1] = 0xFE;
                    commentSegment[2] = (segmentLength >> 8) & 0xFF;
                    commentSegment[3] = segmentLength & 0xFF;
                    commentSegment.set(commentData, 4);

                    const result = new Uint8Array(content.length + commentSegment.length);
                    result.set(content.slice(0, insertPos), 0);
                    result.set(commentSegment, insertPos);
                    result.set(content.slice(insertPos), insertPos + commentSegment.length);
                    
                    return result;
                }

                arraysEqual(a, b) {
                    if (a.length !== b.length) return false;
                    for (let i = 0; i < a.length; i++) {
                        if (a[i] !== b[i]) return false;
                    }
                    return true;
                }

                // Calculate optimal attempt count based on target difficulty
                calculateOptimalMaxAttempts(targetPrefix) {
                    const prefixLength = targetPrefix.length;
                    const expectedAttempts = Math.pow(16, prefixLength);
                    // Use statistical approach: 3 * expected attempts for ~95% success rate
                    return Math.min(Math.max(expectedAttempts * 3, 100000), 10000000);
                }

                async findMatchingHash(targetHex, originalData, isPNG, hashAlgorithm, maxAttempts = 1000000) {
                    const targetPrefix = targetHex.startsWith('0x') ? targetHex.slice(2).toLowerCase() : targetHex.toLowerCase();
                    const optimalMaxAttempts = this.calculateOptimalMaxAttempts(targetPrefix);
                    const actualMaxAttempts = Math.min(maxAttempts, optimalMaxAttempts);
                    
                    // Reduce progress update frequency for better performance (every 50K attempts)
                    const progressInterval = Math.max(50000, Math.floor(actualMaxAttempts / 100));
                    
                    // Pre-parse chunks for PNG to avoid repeated parsing
                    let chunks;
                    if (isPNG) {
                        chunks = this.parsePNGChunks(originalData);
                    }
                    
                    for (let i = 0; i < actualMaxAttempts; i++) {
                        if (i % progressInterval === 0) {
                            self.postMessage({ type: 'progress', attempt: i, maxAttempts: actualMaxAttempts });
                        }

                        let testContent;
                        
                        if (isPNG) {
                            const testData = new TextEncoder().encode('Hash attempt ' + i + ' - ' + Date.now());
                            const commentChunk = this.createPNGChunk(new Uint8Array([116, 69, 88, 116]), testData); // tEXt
                            const iendChunk = this.createPNGChunk(new Uint8Array([73, 69, 78, 68]), new Uint8Array(0)); // IEND
                            
                            let totalLength = this.PNG_SIGNATURE.length + commentChunk.length + iendChunk.length;
                            chunks.forEach(chunk => totalLength += chunk.length);
                            
                            testContent = new Uint8Array(totalLength);
                            let pos = 0;
                            
                            testContent.set(this.PNG_SIGNATURE, pos);
                            pos += this.PNG_SIGNATURE.length;
                            
                            chunks.forEach(chunk => {
                                testContent.set(chunk, pos);
                                pos += chunk.length;
                            });
                            
                            testContent.set(commentChunk, pos);
                            pos += commentChunk.length;
                            
                            testContent.set(iendChunk, pos);
                        } else {
                            const comment = 'Hash attempt ' + i + ' - ' + Date.now();
                            testContent = this.addJPEGComment(originalData, comment);
                        }

                        const hash = await (hashAlgorithm === 'sha512' ? this.sha512(testContent) : this.sha256(testContent));
                        
                        if (hash.startsWith(targetPrefix)) {
                            self.postMessage({ 
                                type: 'success', 
                                content: Array.from(testContent),
                                hash: hash,
                                attempts: i + 1
                            });
                            return;
                        }
                    }

                    self.postMessage({ type: 'error', message: 'Could not find matching hash after ' + maxAttempts + ' attempts' });
                }
            }

            const worker = new OptimizedHashWorker();

            self.onmessage = async function(e) {
                const { targetHex, originalData, isPNG, hashAlgorithm, maxAttempts } = e.data;
                const dataArray = new Uint8Array(originalData);
                await worker.findMatchingHash(targetHex, dataArray, isPNG, hashAlgorithm, maxAttempts);
            };
        `,a=new Blob([s],{type:"application/javascript"});this.worker=new Worker(URL.createObjectURL(a))}async spoofImage(s,a,n="sha512",t=null){return this.worker||await this.init(),new Promise((e,r)=>{const o=new FileReader;o.onload=i=>{const l=new Uint8Array(i.target.result),c=this.arraysEqual(l.slice(0,8),this.PNG_SIGNATURE),g=this.arraysEqual(l.slice(0,2),this.JPEG_SIGNATURE);if(!c&&!g){r(new Error("Unsupported image format. Only PNG and JPEG are supported."));return}this.worker.onmessage=d=>{const{type:h,content:m,hash:p,attempts:f,attempt:y,maxAttempts:w,message:x}=d.data;if(h==="progress"&&t)t(y,w);else if(h==="success"){const k=new Uint8Array(m),A=new Blob([k],{type:c?"image/png":"image/jpeg"});e({blob:A,hash:p,attempts:f})}else h==="error"&&r(new Error(x))},this.worker.postMessage({targetHex:s,originalData:Array.from(l),isPNG:c,hashAlgorithm:n,maxAttempts:1e6})},o.readAsArrayBuffer(a)})}arraysEqual(s,a){if(s.length!==a.length)return!1;for(let n=0;n<s.length;n++)if(s[n]!==a[n])return!1;return!0}}class b{constructor(){this.spoofer=new E,this.initializeEventListeners()}initializeEventListeners(){const s=document.getElementById("spoofForm"),a=document.getElementById("imageFile"),n=document.getElementById("fileDisplay"),t=document.querySelector(".file-input-wrapper");a.addEventListener("change",e=>{const r=e.target.files[0];if(r){if(!["image/png","image/jpeg","image/jpg"].includes(r.type)){this.showResult("Please select a valid PNG or JPEG image file","error"),a.value="";return}if(r.size>50*1024*1024){this.showResult("File size too large. Please select a file smaller than 50MB","error"),a.value="";return}n.classList.add("has-file"),n.innerHTML=`
                    <svg class="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    <span>${r.name}</span>
                    <button type="button" class="remove-file" onclick="this.parentElement.parentElement.querySelector('input').value=''; this.parentElement.classList.remove('has-file'); this.parentElement.innerHTML='<svg class=\\"upload-icon\\" fill=\\"none\\" stroke=\\"currentColor\\" viewBox=\\"0 0 24 24\\"><path stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\" stroke-width=\\"2\\" d=\\"M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12\\"></path></svg><span>Click to select an image file</span>';">×</button>
                `}else n.classList.remove("has-file"),n.innerHTML=`
                    <svg class="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                    </svg>
                    <span>Click to select an image file</span>
                `}),n.addEventListener("click",()=>{a.click()}),t.addEventListener("dragover",e=>{e.preventDefault(),e.stopPropagation(),n.classList.add("drag-over")}),t.addEventListener("dragleave",e=>{e.preventDefault(),e.stopPropagation(),n.classList.remove("drag-over")}),t.addEventListener("drop",e=>{e.preventDefault(),e.stopPropagation(),n.classList.remove("drag-over");const r=e.dataTransfer.files;if(r.length>0){a.files=r;const o=new Event("change",{bubbles:!0});a.dispatchEvent(o)}}),s.addEventListener("submit",e=>{e.preventDefault(),this.handleSpoof()})}async handleSpoof(){const s=document.getElementById("targetHash").value.trim(),a=document.getElementById("hashAlgorithm").value,n=document.getElementById("imageFile").files[0],t=document.getElementById("spoofButton"),e=document.getElementById("progress"),r=document.getElementById("result");if(!s||!n){this.showResult("Please fill in all fields","error"),r.scrollIntoView({behavior:"smooth",block:"nearest"});return}if(!s.startsWith("0x")){this.showResult('Target hash must start with "0x"',"error"),r.scrollIntoView({behavior:"smooth",block:"nearest"});return}if(!/^0x[0-9a-fA-F]+$/.test(s)){this.showResult("Target hash must be a valid hexadecimal string (e.g., 0x24, 0xabc123)","error"),r.scrollIntoView({behavior:"smooth",block:"nearest"});return}t.disabled=!0,t.textContent="Processing...",e.classList.add("show"),r.classList.remove("show");try{const{blob:i,hash:l,attempts:c}=await this.spoofer.spoofImage(s,n,a,(m,p)=>{const f=m/p*100;document.getElementById("progressFill").style.width=`${f}%`,document.getElementById("progressText").textContent=`Attempt ${m.toLocaleString()} of ${p.toLocaleString()}...`}),g=URL.createObjectURL(i),d=n.name.split(".").pop(),h=`spoofed_${s.replace("0x","")}.${d}`;this.showResult(`
                <h3>✅ Success!</h3>
                <p>Found matching hash after <strong>${c.toLocaleString()}</strong> attempts.</p>
                <div class="hash-display">
                    <strong>Final Hash:</strong><br>
                    ${l}
                </div>
                <a href="${g}" download="${h}" class="download-link">
                    📥 Download Spoofed Image
                </a>
            `,"success"),setTimeout(()=>{r.scrollIntoView({behavior:"smooth",block:"nearest"})},100)}catch(i){this.showResult(`❌ Error: ${i.message}`,"error"),setTimeout(()=>{r.scrollIntoView({behavior:"smooth",block:"nearest"})},100)}finally{t.disabled=!1,t.textContent="Start Hash Spoofing",e.classList.remove("show")}}showResult(s,a){const n=document.getElementById("result"),t=document.getElementById("resultContent");n.className=`result ${a} show`,t.innerHTML=s}}document.addEventListener("DOMContentLoaded",()=>{new b,document.addEventListener("wheel",u=>{const s=document.querySelector(".container");s&&s.contains(u.target)},{passive:!0}),"scrollRestoration"in history&&(history.scrollRestoration="manual")});
