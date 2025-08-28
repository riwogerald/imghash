(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))n(s);new MutationObserver(s=>{for(const a of s)if(a.type==="childList")for(const o of a.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&n(o)}).observe(document,{childList:!0,subtree:!0});function t(s){const a={};return s.integrity&&(a.integrity=s.integrity),s.referrerPolicy&&(a.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?a.credentials="include":s.crossOrigin==="anonymous"?a.credentials="omit":a.credentials="same-origin",a}function n(s){if(s.ep)return;s.ep=!0;const a=t(s);fetch(s.href,a)}})();class P{constructor(){this.PNG_SIGNATURE=new Uint8Array([137,80,78,71,13,10,26,10]),this.JPEG_SIGNATURE=new Uint8Array([255,216]),this.worker=null,this.workerPool=[],this.poolSize=Math.min(navigator.hardwareConcurrency||4,4)}async init(){const e=`
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
        `,t=new Blob([e],{type:"application/javascript"});this.worker=new Worker(URL.createObjectURL(t))}async spoofImage(e,t,n="sha512",s=null){return this.worker||await this.init(),new Promise((a,o)=>{const i=new FileReader;i.onload=l=>{const c=new Uint8Array(l.target.result),m=this.arraysEqual(c.slice(0,8),this.PNG_SIGNATURE),h=this.arraysEqual(c.slice(0,2),this.JPEG_SIGNATURE);if(!m&&!h){o(new Error("Unsupported image format. Only PNG and JPEG are supported."));return}this.worker.onmessage=d=>{const{type:u,content:p,hash:g,attempts:y,attempt:x,maxAttempts:v,message:k}=d.data;if(u==="progress"&&s)s(x,v);else if(u==="success"){const E=new Uint8Array(p),S=new Blob([E],{type:m?"image/png":"image/jpeg"});a({blob:S,hash:g,attempts:y})}else u==="error"&&o(new Error(k))},this.worker.postMessage({targetHex:e,originalData:Array.from(c),isPNG:m,hashAlgorithm:n,maxAttempts:1e6})},i.readAsArrayBuffer(t)})}arraysEqual(e,t){if(e.length!==t.length)return!1;for(let n=0;n<e.length;n++)if(e[n]!==t[n])return!1;return!0}}class C{constructor(){this.spoofer=new P,this.initializeEventListeners()}initializeEventListeners(){const e=document.getElementById("spoofForm"),t=document.getElementById("imageFile"),n=document.getElementById("fileDisplay"),s=document.querySelector(".file-input-wrapper");t.addEventListener("change",a=>{const o=a.target.files[0];if(o){if(!["image/png","image/jpeg","image/jpg"].includes(o.type)){this.showResult("Please select a valid PNG or JPEG image file","error"),t.value="";return}if(o.size>50*1024*1024){this.showResult("File size too large. Please select a file smaller than 50MB","error"),t.value="";return}n.classList.add("has-file"),n.innerHTML=`
                    <svg class="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    <span>${o.name}</span>
                    <button type="button" class="remove-file" onclick="this.parentElement.parentElement.querySelector('input').value=''; this.parentElement.classList.remove('has-file'); this.parentElement.innerHTML='<svg class=\\"upload-icon\\" fill=\\"none\\" stroke=\\"currentColor\\" viewBox=\\"0 0 24 24\\"><path stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\" stroke-width=\\"2\\" d=\\"M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12\\"></path></svg><span>Click to select an image file</span>';">×</button>
                `}else n.classList.remove("has-file"),n.innerHTML=`
                    <svg class="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                    </svg>
                    <span>Click to select an image file</span>
                `}),n.addEventListener("click",()=>{t.click()}),s.addEventListener("dragover",a=>{a.preventDefault(),a.stopPropagation(),n.classList.add("drag-over")}),s.addEventListener("dragleave",a=>{a.preventDefault(),a.stopPropagation(),n.classList.remove("drag-over")}),s.addEventListener("drop",a=>{a.preventDefault(),a.stopPropagation(),n.classList.remove("drag-over");const o=a.dataTransfer.files;if(o.length>0){t.files=o;const i=new Event("change",{bubbles:!0});t.dispatchEvent(i)}}),e.addEventListener("submit",a=>{a.preventDefault(),this.handleSpoof()})}async handleSpoof(){const e=document.getElementById("targetHash").value.trim(),t=document.getElementById("hashAlgorithm").value,n=document.getElementById("imageFile").files[0],s=document.getElementById("spoofButton"),a=document.getElementById("progress"),o=document.getElementById("result");if(!e||!n){this.showResult("Please fill in all fields","error"),o.scrollIntoView({behavior:"smooth",block:"nearest"});return}if(!e.startsWith("0x")){this.showResult('Target hash must start with "0x"',"error"),o.scrollIntoView({behavior:"smooth",block:"nearest"});return}if(!/^0x[0-9a-fA-F]+$/.test(e)){this.showResult("Target hash must be a valid hexadecimal string (e.g., 0x24, 0xabc123)","error"),o.scrollIntoView({behavior:"smooth",block:"nearest"});return}s.disabled=!0,s.textContent="Processing...",a.classList.add("show"),o.classList.remove("show");try{const{blob:l,hash:c,attempts:m}=await this.spoofer.spoofImage(e,n,t,(p,g)=>{const y=p/g*100;document.getElementById("progressFill").style.width=`${y}%`,document.getElementById("progressText").textContent=`Attempt ${p.toLocaleString()} of ${g.toLocaleString()}...`}),h=URL.createObjectURL(l),d=n.name.split(".").pop(),u=`spoofed_${e.replace("0x","")}.${d}`;this.showResult(`
                <h3>✅ Success!</h3>
                <p>Found matching hash after <strong>${m.toLocaleString()}</strong> attempts.</p>
                <div class="hash-display">
                    <strong>Final Hash:</strong><br>
                    ${c}
                </div>
                <a href="${h}" download="${u}" class="download-link">
                    📥 Download Spoofed Image
                </a>
            `,"success"),setTimeout(()=>{o.scrollIntoView({behavior:"smooth",block:"nearest"})},100)}catch(l){this.showResult(`❌ Error: ${l.message}`,"error"),setTimeout(()=>{o.scrollIntoView({behavior:"smooth",block:"nearest"})},100)}finally{s.disabled=!1,s.textContent="Start Hash Spoofing",a.classList.remove("show")}}showResult(e,t){const n=document.getElementById("result"),s=document.getElementById("resultContent");n.className=`result ${t} show`,s.innerHTML=e}}let A=!1,f=null;function w(){f||(f={data:JSON.parse(localStorage.getItem("imghash-analytics")||"{}"),recordAttempt:function(r){this.data.attempts||(this.data.attempts=[]),this.data.attempts.push({timestamp:new Date().toISOString(),...r}),localStorage.setItem("imghash-analytics",JSON.stringify(this.data)),this.updateStats()},updateStats:function(){const r=this.data.attempts||[],e=r.filter(s=>s.success);document.getElementById("totalAttempts").textContent=r.length,document.getElementById("totalSuccesses").textContent=e.length,document.getElementById("overallSuccessRate").textContent=r.length>0?Math.round(e.length/r.length*100)+"%":"0%";const t=10080*60*1e3,n=r.filter(s=>Date.now()-new Date(s.timestamp).getTime()<=t);document.getElementById("weeklyAttempts").textContent=n.length},clearData:function(){this.data={},localStorage.removeItem("imghash-analytics"),this.updateStats()},exportData:function(){const r={exportDate:new Date().toISOString(),analytics:this.data},e=new Blob([JSON.stringify(r,null,2)],{type:"application/json"}),t=URL.createObjectURL(e),n=document.createElement("a");n.href=t,n.download="imghash-analytics-"+new Date().toISOString().split("T")[0]+".json",document.body.appendChild(n),n.click(),document.body.removeChild(n),URL.revokeObjectURL(t)}},f.updateStats())}function I(){const r=document.getElementById("analyticsSection"),e=document.getElementById("toggleAnalyticsBtn");A=!A,A?(r.style.display="block",e.textContent="📊 Hide Performance Analytics",w(),b()):(r.style.display="none",e.textContent="📊 Show Performance Analytics")}function L(){confirm("Are you sure you want to clear all analytics data? This cannot be undone.")&&(w(),f.clearData(),b())}function T(){w(),f.exportData()}function D(){const r=document.getElementById("predictionPrefix"),e=document.getElementById("predictionAlgorithm"),t=document.getElementById("predictionResults"),n=r.value.trim();if(!n){alert("Please enter a target prefix (e.g., 0x24)");return}if(!n.match(/^0x[0-9a-fA-F]+$/)){alert("Please enter a valid hex prefix (e.g., 0x24, 0xabc)");return}const s=n.replace("0x","").length,a=e.value,o=Math.pow(16,s),i=Math.round(o/1e3),l=s<=2?"Easy":s<=4?"Medium":s<=6?"Hard":"Very Hard";t.style.display="block",t.innerHTML=`
        <div class="prediction-item">
            <span class="prediction-label">Difficulty:</span>
            <span class="prediction-value">${l}</span>
        </div>
        <div class="prediction-item">
            <span class="prediction-label">Expected Attempts:</span>
            <span class="prediction-value">${o.toLocaleString()}</span>
        </div>
        <div class="prediction-item">
            <span class="prediction-label">Estimated Time:</span>
            <span class="prediction-value">${i<60?i+"s":Math.round(i/60)+"m"}</span>
        </div>
        <div class="prediction-item">
            <span class="prediction-label">Algorithm:</span>
            <span class="prediction-value">${a.toUpperCase()}</span>
        </div>
        <div class="prediction-item">
            <span class="prediction-label">Success Probability:</span>
            <span class="prediction-value">~63% after ${o.toLocaleString()} attempts</span>
        </div>
    `}function b(){w();const r=f.data.attempts||[];R(r),B(r),M(r),U(r)}function R(r){const e=document.getElementById("successRateChart");if(!e)return;const t=e.getContext("2d"),n=e.width,s=e.height;t.clearRect(0,0,n,s);const a=r.filter(d=>d.success).length;r.length-a;const o=r.length;if(o===0){t.fillStyle="#6b7280",t.font="16px Arial",t.textAlign="center",t.fillText("No data available yet",n/2,s/2);return}const i=a/o*100,l=n*.6,c=30,m=(n-l)/2,h=s/2-c/2;t.fillStyle="#e5e7eb",t.fillRect(m,h,l,c),t.fillStyle="#22c55e",t.fillRect(m,h,l*i/100,c),t.fillStyle="#1f2937",t.font="14px Arial",t.textAlign="center",t.fillText(`Success Rate: ${i.toFixed(1)}%`,n/2,h-10),t.fillText(`${a}/${o} attempts successful`,n/2,h+c+20)}function B(r){const e=document.getElementById("prefixDifficultyChart");if(!e)return;const t=e.getContext("2d");t.clearRect(0,0,e.width,e.height);const n={};r.forEach(l=>{const c=(l.targetPrefix||"0x0").replace("0x","").length;n[c]||(n[c]={total:0,success:0}),n[c].total++,l.success&&n[c].success++});const s=Object.keys(n).sort((l,c)=>l-c);if(s.length===0){t.fillStyle="#6b7280",t.font="16px Arial",t.textAlign="center",t.fillText("No data available yet",e.width/2,e.height/2);return}const a=Math.min(50,e.width/s.length-10),o=e.height-60,i=Math.max(...s.map(l=>n[l].success/n[l].total*100));s.forEach((l,c)=>{const m=n[l],h=m.success/m.total*100,d=i>0?h/i*o:0,u=e.width/s.length*c+(e.width/s.length-a)/2,p=e.height-40-d;t.fillStyle="#667eea",t.fillRect(u,p,a,d),t.fillStyle="#1f2937",t.font="12px Arial",t.textAlign="center",t.fillText(`${l}`,u+a/2,e.height-10),t.fillText(`${h.toFixed(0)}%`,u+a/2,p-5)})}function M(r){const e=document.getElementById("algorithmComparisonChart");if(!e)return;const t=e.getContext("2d");t.clearRect(0,0,e.width,e.height);const n={sha256:0,sha512:0};r.forEach(h=>{h.hashAlgorithm&&n[h.hashAlgorithm]++});const s=n.sha256+n.sha512;if(s===0){t.fillStyle="#6b7280",t.font="16px Arial",t.textAlign="center",t.fillText("No data available yet",e.width/2,e.height/2);return}const a=e.width/2,o=e.height/2,i=Math.min(a,o)-20;let l=0;const c=["#667eea","#764ba2"];["sha256","sha512"].forEach((h,d)=>{const u=n[h];if(u===0)return;const p=u/s*2*Math.PI;t.beginPath(),t.moveTo(a,o),t.arc(a,o,i,l,l+p),t.closePath(),t.fillStyle=c[d],t.fill();const g=l+p/2,y=a+Math.cos(g)*(i/2),x=o+Math.sin(g)*(i/2);t.fillStyle="#ffffff",t.font="12px Arial",t.textAlign="center",t.fillText(h.toUpperCase(),y,x),t.fillText(`${u}`,y,x+15),l+=p})}function U(r){const e=document.getElementById("performanceChart");if(!e)return;const t=e.getContext("2d");if(t.clearRect(0,0,e.width,e.height),r.length===0){t.fillStyle="#6b7280",t.font="16px Arial",t.textAlign="center",t.fillText("No data available yet",e.width/2,e.height/2);return}const n=r.slice(-20),s=Math.max(...n.map(i=>i.attempts||1)),a=e.width-40,o=e.height-40;t.strokeStyle="#667eea",t.lineWidth=2,t.beginPath(),n.forEach((i,l)=>{const c=20+a/Math.max(n.length-1,1)*l,m=20+o-(i.attempts||1)/s*o;l===0?t.moveTo(c,m):t.lineTo(c,m),t.fillStyle=i.success?"#22c55e":"#ef4444",t.fillRect(c-2,m-2,4,4)}),t.stroke(),t.fillStyle="#1f2937",t.font="12px Arial",t.textAlign="center",t.fillText("Recent Attempts Performance",e.width/2,15)}window.toggleAnalytics=I;window.clearAnalytics=L;window.exportAnalytics=T;window.generatePrediction=D;document.addEventListener("DOMContentLoaded",()=>{const r=new C,e=r.spoofer.spoofImage.bind(r.spoofer);r.spoofer.spoofImage=async function(t,n,s="sha512",a=null){const o=Date.now();try{const i=await e(t,n,s,a);return f&&f.recordAttempt({targetPrefix:t,attempts:i.attempts,duration:Date.now()-o,success:!0,hashAlgorithm:s,imageFormat:n.type,fileSize:n.size}),i}catch(i){throw f&&f.recordAttempt({targetPrefix:t,attempts:0,duration:Date.now()-o,success:!1,hashAlgorithm:s,imageFormat:n.type,fileSize:n.size}),i}},document.addEventListener("wheel",t=>{const n=document.querySelector(".container");n&&n.contains(t.target)},{passive:!0}),"scrollRestoration"in history&&(history.scrollRestoration="manual")});
