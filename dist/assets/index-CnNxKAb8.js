(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const t of document.querySelectorAll('link[rel="modulepreload"]'))s(t);new MutationObserver(t=>{for(const n of t)if(n.type==="childList")for(const a of n.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&s(a)}).observe(document,{childList:!0,subtree:!0});function r(t){const n={};return t.integrity&&(n.integrity=t.integrity),t.referrerPolicy&&(n.referrerPolicy=t.referrerPolicy),t.crossOrigin==="use-credentials"?n.credentials="include":t.crossOrigin==="anonymous"?n.credentials="omit":n.credentials="same-origin",n}function s(t){if(t.ep)return;t.ep=!0;const n=r(t);fetch(t.href,n)}})();class E{constructor(){this.PNG_SIGNATURE=new Uint8Array([137,80,78,71,13,10,26,10]),this.JPEG_SIGNATURE=new Uint8Array([255,216]),this.worker=null}async init(){const e=`
            class HashWorker {
                constructor() {
                    this.PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
                    this.JPEG_SIGNATURE = new Uint8Array([0xFF, 0xD8]);
                }

                async sha256(data) {
                    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                    const hashArray = Array.from(new Uint8Array(hashBuffer));
                    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                }

                async sha512(data) {
                    const hashBuffer = await crypto.subtle.digest('SHA-512', data);
                    const hashArray = Array.from(new Uint8Array(hashBuffer));
                    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
                    const crcTable = this.makeCRCTable();
                    let crc = 0xFFFFFFFF;
                    
                    for (let i = 0; i < data.length; i++) {
                        crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
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

                async findMatchingHash(targetHex, originalData, isPNG, hashAlgorithm, maxAttempts = 1000000) {
                    const targetPrefix = targetHex.startsWith('0x') ? targetHex.slice(2).toLowerCase() : targetHex.toLowerCase();
                    
                    for (let i = 0; i < maxAttempts; i++) {
                        if (i % 10000 === 0) {
                            self.postMessage({ type: 'progress', attempt: i, maxAttempts });
                        }

                        let testContent;
                        
                        if (isPNG) {
                            const chunks = this.parsePNGChunks(originalData);
                            const testData = new TextEncoder().encode(\`Hash attempt \${i} - \${Date.now()}\`);
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
                            const comment = \`Hash attempt \${i} - \${Date.now()}\`;
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

                    self.postMessage({ type: 'error', message: \`Could not find matching hash after \${maxAttempts} attempts\` });
                }
            }

            const worker = new HashWorker();

            self.onmessage = async function(e) {
                const { targetHex, originalData, isPNG, hashAlgorithm, maxAttempts } = e.data;
                const dataArray = new Uint8Array(originalData);
                await worker.findMatchingHash(targetHex, dataArray, isPNG, hashAlgorithm, maxAttempts);
            };
        `,r=new Blob([e],{type:"application/javascript"});this.worker=new Worker(URL.createObjectURL(r))}async spoofImage(e,r,s="sha512",t=null){return this.worker||await this.init(),new Promise((n,a)=>{const o=new FileReader;o.onload=m=>{const c=new Uint8Array(m.target.result),l=this.arraysEqual(c.slice(0,8),this.PNG_SIGNATURE),u=this.arraysEqual(c.slice(0,2),this.JPEG_SIGNATURE);if(!l&&!u){a(new Error("Unsupported image format. Only PNG and JPEG are supported."));return}this.worker.onmessage=g=>{const{type:i,content:h,hash:f,attempts:p,attempt:y,maxAttempts:w,message:A}=g.data;if(i==="progress"&&t)t(y,w);else if(i==="success"){const x=new Uint8Array(h),k=new Blob([x],{type:l?"image/png":"image/jpeg"});n({blob:k,hash:f,attempts:p})}else i==="error"&&a(new Error(A))},this.worker.postMessage({targetHex:e,originalData:Array.from(c),isPNG:l,hashAlgorithm:s,maxAttempts:1e6})},o.readAsArrayBuffer(r)})}arraysEqual(e,r){if(e.length!==r.length)return!1;for(let s=0;s<e.length;s++)if(e[s]!==r[s])return!1;return!0}}class C{constructor(){this.spoofer=new E,this.initializeEventListeners()}initializeEventListeners(){const e=document.getElementById("spoofForm"),r=document.getElementById("imageFile"),s=document.getElementById("fileDisplay");r.addEventListener("change",t=>{const n=t.target.files[0];n&&(s.classList.add("has-file"),s.innerHTML=`
                    <svg class="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    <span>${n.name}</span>
                `)}),e.addEventListener("submit",t=>{t.preventDefault(),this.handleSpoof()})}async handleSpoof(){const e=document.getElementById("targetHash").value.trim(),r=document.getElementById("hashAlgorithm").value,s=document.getElementById("imageFile").files[0],t=document.getElementById("spoofButton"),n=document.getElementById("progress"),a=document.getElementById("result");if(!e||!s){this.showResult("Please fill in all fields","error");return}if(!e.startsWith("0x")){this.showResult('Target hash must start with "0x"',"error");return}t.disabled=!0,t.textContent="Processing...",n.classList.add("show"),a.classList.remove("show");try{const{blob:o,hash:m,attempts:c}=await this.spoofer.spoofImage(e,s,r,(i,h)=>{const f=i/h*100;document.getElementById("progressFill").style.width=`${f}%`,document.getElementById("progressText").textContent=`Attempt ${i.toLocaleString()} of ${h.toLocaleString()}...`}),l=URL.createObjectURL(o),u=s.name.split(".").pop(),g=`spoofed_${e.replace("0x","")}.${u}`;this.showResult(`
                <h3>✅ Success!</h3>
                <p>Found matching hash after <strong>${c.toLocaleString()}</strong> attempts.</p>
                <div class="hash-display">
                    <strong>Final Hash:</strong><br>
                    ${m}
                </div>
                <a href="${l}" download="${g}" class="download-link">
                    📥 Download Spoofed Image
                </a>
            `,"success")}catch(o){this.showResult(`❌ Error: ${o.message}`,"error")}finally{t.disabled=!1,t.textContent="Start Hash Spoofing",n.classList.remove("show")}}showResult(e,r){const s=document.getElementById("result"),t=document.getElementById("resultContent");s.className=`result ${r} show`,t.innerHTML=e}}document.addEventListener("DOMContentLoaded",()=>{new C});
