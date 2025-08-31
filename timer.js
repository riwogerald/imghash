/**
 * HashingTimer - Comprehensive timing and performance measurement for hash operations
 * Provides real-time progress tracking, ETA calculations, and detailed performance metrics
 */
export class HashingTimer {
    constructor() {
        this.startTime = null;
        this.endTime = null;
        this.checkpoints = [];
        this.performanceMetrics = {
            totalElapsed: 0,
            averageRate: 0,
            currentRate: 0,
            peakRate: 0,
            estimatedCompletion: null,
            memoryUsage: []
        };
        this.isRunning = false;
        this.lastProgressUpdate = 0;
        this.progressUpdateInterval = 1000; // Update every 1 second
    }

    /**
     * Start the timer
     */
    start() {
        this.startTime = performance.now();
        this.isRunning = true;
        this.checkpoints = [];
        this.performanceMetrics = {
            totalElapsed: 0,
            averageRate: 0,
            currentRate: 0,
            peakRate: 0,
            estimatedCompletion: null,
            memoryUsage: []
        };
        return this.startTime;
    }

    /**
     * Stop the timer
     */
    stop() {
        if (!this.isRunning) return null;
        
        this.endTime = performance.now();
        this.isRunning = false;
        this.performanceMetrics.totalElapsed = this.endTime - this.startTime;
        return this.endTime;
    }

    /**
     * Add a checkpoint with performance analysis
     */
    addCheckpoint(name, currentAttempt, totalAttempts, additionalData = {}) {
        if (!this.isRunning) return null;

        const now = performance.now();
        const elapsed = now - this.startTime;
        
        // Calculate rates
        const overallRate = currentAttempt / (elapsed / 1000);
        
        // Calculate current rate based on recent checkpoints
        let currentRate = overallRate;
        if (this.checkpoints.length > 0) {
            const lastCheckpoint = this.checkpoints[this.checkpoints.length - 1];
            const timeDiff = (now - lastCheckpoint.timestamp) / 1000;
            const attemptDiff = currentAttempt - lastCheckpoint.attempt;
            if (timeDiff > 0) {
                currentRate = attemptDiff / timeDiff;
            }
        }

        // Estimate completion time
        const remainingAttempts = totalAttempts - currentAttempt;
        const estimatedRemainingMs = remainingAttempts / overallRate * 1000;
        const estimatedCompletion = new Date(Date.now() + estimatedRemainingMs);

        // Memory usage (if available)
        let memoryUsage = null;
        if (typeof performance !== 'undefined' && performance.memory) {
            memoryUsage = {
                used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024 * 100) / 100,
                total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024 * 100) / 100,
                limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024 * 100) / 100
            };
        }

        const checkpoint = {
            name,
            timestamp: now,
            elapsed: elapsed / 1000, // Convert to seconds
            attempt: currentAttempt,
            totalAttempts,
            overallRate: Math.round(overallRate),
            currentRate: Math.round(currentRate),
            estimatedRemainingSeconds: estimatedRemainingMs / 1000,
            estimatedCompletion,
            memoryUsage,
            percentage: (currentAttempt / totalAttempts) * 100,
            ...additionalData
        };

        this.checkpoints.push(checkpoint);

        // Update performance metrics
        this.performanceMetrics.totalElapsed = elapsed;
        this.performanceMetrics.averageRate = overallRate;
        this.performanceMetrics.currentRate = currentRate;
        this.performanceMetrics.peakRate = Math.max(this.performanceMetrics.peakRate, currentRate);
        this.performanceMetrics.estimatedCompletion = estimatedCompletion;
        
        if (memoryUsage) {
            this.performanceMetrics.memoryUsage.push({
                timestamp: now,
                ...memoryUsage
            });
        }

        return checkpoint;
    }

    /**
     * Get current performance summary
     */
    getCurrentPerformance() {
        if (!this.isRunning || this.checkpoints.length === 0) return null;

        const latest = this.checkpoints[this.checkpoints.length - 1];
        return {
            elapsed: latest.elapsed,
            currentRate: latest.currentRate,
            averageRate: latest.overallRate,
            peakRate: this.performanceMetrics.peakRate,
            estimatedRemaining: latest.estimatedRemainingSeconds,
            estimatedCompletion: latest.estimatedCompletion,
            percentage: latest.percentage,
            memoryUsage: latest.memoryUsage
        };
    }

    /**
     * Get formatted time display
     */
    formatTime(seconds) {
        if (seconds < 60) {
            return `${Math.round(seconds)}s`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = Math.round(seconds % 60);
            return `${minutes}m ${remainingSeconds}s`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const remainingMinutes = Math.floor((seconds % 3600) / 60);
            return `${hours}h ${remainingMinutes}m`;
        }
    }

    /**
     * Get formatted ETA display
     */
    getFormattedETA() {
        const perf = this.getCurrentPerformance();
        if (!perf || !perf.estimatedCompletion) return 'Calculating...';

        const now = new Date();
        const eta = perf.estimatedCompletion;
        
        if (eta < now) return 'Very soon';
        
        const diff = (eta - now) / 1000;
        return this.formatTime(diff);
    }

    /**
     * Get detailed performance report
     */
    getPerformanceReport() {
        return {
            duration: this.performanceMetrics.totalElapsed / 1000,
            checkpoints: this.checkpoints.length,
            averageRate: this.performanceMetrics.averageRate,
            peakRate: this.performanceMetrics.peakRate,
            memoryUsageHistory: this.performanceMetrics.memoryUsage,
            timeline: this.checkpoints.map(cp => ({
                name: cp.name,
                elapsed: cp.elapsed,
                rate: cp.currentRate,
                percentage: cp.percentage
            }))
        };
    }

    /**
     * Calculate performance statistics
     */
    getStatistics() {
        if (this.checkpoints.length < 2) return null;

        const rates = this.checkpoints.map(cp => cp.currentRate).filter(r => r > 0);
        const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
        const variance = rates.reduce((acc, rate) => acc + Math.pow(rate - mean, 2), 0) / rates.length;
        const stdDev = Math.sqrt(variance);

        return {
            meanRate: Math.round(mean),
            standardDeviation: Math.round(stdDev),
            coefficientOfVariation: stdDev / mean,
            isStable: (stdDev / mean) < 0.2, // Less than 20% variation
            trendDirection: this.calculateTrend()
        };
    }

    /**
     * Calculate performance trend (improving, declining, stable)
     */
    calculateTrend() {
        if (this.checkpoints.length < 3) return 'insufficient_data';

        const recentCheckpoints = this.checkpoints.slice(-5); // Last 5 checkpoints
        const rates = recentCheckpoints.map(cp => cp.currentRate);
        
        let increasing = 0;
        let decreasing = 0;
        
        for (let i = 1; i < rates.length; i++) {
            if (rates[i] > rates[i-1]) increasing++;
            else if (rates[i] < rates[i-1]) decreasing++;
        }

        if (increasing > decreasing) return 'improving';
        if (decreasing > increasing) return 'declining';
        return 'stable';
    }

    /**
     * Should update progress? (throttling)
     */
    shouldUpdateProgress() {
        const now = performance.now();
        if (now - this.lastProgressUpdate >= this.progressUpdateInterval) {
            this.lastProgressUpdate = now;
            return true;
        }
        return false;
    }

    /**
     * Set progress update frequency
     */
    setProgressUpdateInterval(ms) {
        this.progressUpdateInterval = ms;
    }
}

/**
 * OperationTimer - For timing specific operations within hashing
 */
export class OperationTimer {
    constructor() {
        this.operations = new Map();
        this.isProfileMode = false;
    }

    /**
     * Enable detailed profiling mode
     */
    enableProfiling() {
        this.isProfileMode = true;
    }

    /**
     * Start timing an operation
     */
    startOperation(name) {
        const startTime = performance.now();
        this.operations.set(name, {
            startTime,
            endTime: null,
            duration: null,
            calls: (this.operations.get(name)?.calls || 0) + 1
        });
        return startTime;
    }

    /**
     * End timing an operation
     */
    endOperation(name) {
        const endTime = performance.now();
        const operation = this.operations.get(name);
        
        if (!operation) {
            console.warn(`Operation "${name}" was not started`);
            return null;
        }

        const duration = endTime - operation.startTime;
        operation.endTime = endTime;
        operation.duration = duration;

        // Track cumulative stats
        if (!operation.totalDuration) {
            operation.totalDuration = 0;
            operation.minDuration = duration;
            operation.maxDuration = duration;
        }
        
        operation.totalDuration += duration;
        operation.averageDuration = operation.totalDuration / operation.calls;
        operation.minDuration = Math.min(operation.minDuration, duration);
        operation.maxDuration = Math.max(operation.maxDuration, duration);

        this.operations.set(name, operation);
        return duration;
    }

    /**
     * Time a function execution
     */
    async timeFunction(name, fn, ...args) {
        this.startOperation(name);
        try {
            const result = await fn(...args);
            this.endOperation(name);
            return result;
        } catch (error) {
            this.endOperation(name);
            throw error;
        }
    }

    /**
     * Get operation statistics
     */
    getOperationStats(name) {
        return this.operations.get(name) || null;
    }

    /**
     * Get all operation statistics
     */
    getAllStats() {
        const stats = {};
        for (const [name, operation] of this.operations) {
            stats[name] = {
                calls: operation.calls,
                totalDuration: operation.totalDuration || 0,
                averageDuration: operation.averageDuration || 0,
                minDuration: operation.minDuration || 0,
                maxDuration: operation.maxDuration || 0,
                lastDuration: operation.duration || 0
            };
        }
        return stats;
    }

    /**
     * Reset all operation timers
     */
    reset() {
        this.operations.clear();
    }

    /**
     * Get performance summary
     */
    getPerformanceSummary() {
        const stats = this.getAllStats();
        const totalOperations = Object.values(stats).reduce((sum, op) => sum + op.calls, 0);
        const totalTime = Object.values(stats).reduce((sum, op) => sum + op.totalDuration, 0);

        return {
            totalOperations,
            totalTime: totalTime / 1000, // Convert to seconds
            operationBreakdown: stats,
            hottestOperations: Object.entries(stats)
                .sort(([,a], [,b]) => b.totalDuration - a.totalDuration)
                .slice(0, 5)
                .map(([name, op]) => ({
                    name,
                    totalTime: op.totalDuration / 1000,
                    averageTime: op.averageDuration,
                    calls: op.calls
                }))
        };
    }
}

/**
 * HashPerformanceAnalyzer - Specialized timing for hash operations
 */
export class HashPerformanceAnalyzer {
    constructor() {
        this.sessionStats = {
            totalAttempts: 0,
            totalTime: 0,
            successfulAttempts: 0,
            failedAttempts: 0,
            algorithms: {
                sha256: { attempts: 0, time: 0, successes: 0 },
                sha512: { attempts: 0, time: 0, successes: 0 }
            }
        };
        this.realtimeMetrics = {
            currentSession: null,
            lastRateCheck: 0,
            rateHistory: []
        };
    }

    /**
     * Start a new hashing session
     */
    startSession(targetPrefix, algorithm, maxAttempts) {
        this.realtimeMetrics.currentSession = {
            timer: new HashingTimer(),
            targetPrefix,
            algorithm,
            maxAttempts,
            startTime: Date.now()
        };
        
        this.realtimeMetrics.currentSession.timer.start();
        return this.realtimeMetrics.currentSession;
    }

    /**
     * Update session progress
     */
    updateProgress(attempt, additionalData = {}) {
        const session = this.realtimeMetrics.currentSession;
        if (!session) return null;

        const checkpoint = session.timer.addCheckpoint(
            'progress',
            attempt,
            session.maxAttempts,
            {
                algorithm: session.algorithm,
                targetPrefix: session.targetPrefix,
                ...additionalData
            }
        );

        // Track rate history for trend analysis
        this.realtimeMetrics.rateHistory.push({
            timestamp: performance.now(),
            rate: checkpoint.currentRate,
            attempt
        });

        // Keep only last 50 rate measurements
        if (this.realtimeMetrics.rateHistory.length > 50) {
            this.realtimeMetrics.rateHistory.shift();
        }

        return {
            ...checkpoint,
            trend: session.timer.calculateTrend(),
            statistics: session.timer.getStatistics()
        };
    }

    /**
     * End current session
     */
    endSession(success, finalAttempts, finalHash = null) {
        const session = this.realtimeMetrics.currentSession;
        if (!session) return null;

        session.timer.stop();
        const report = session.timer.getPerformanceReport();

        // Update session statistics
        this.sessionStats.totalAttempts += finalAttempts;
        this.sessionStats.totalTime += report.duration;
        
        if (success) {
            this.sessionStats.successfulAttempts++;
            this.sessionStats.algorithms[session.algorithm].successes++;
        } else {
            this.sessionStats.failedAttempts++;
        }

        this.sessionStats.algorithms[session.algorithm].attempts += finalAttempts;
        this.sessionStats.algorithms[session.algorithm].time += report.duration;

        const sessionResult = {
            success,
            attempts: finalAttempts,
            duration: report.duration,
            finalHash,
            algorithm: session.algorithm,
            targetPrefix: session.targetPrefix,
            performanceReport: report,
            statistics: session.timer.getStatistics()
        };

        this.realtimeMetrics.currentSession = null;
        return sessionResult;
    }

    /**
     * Get real-time display data for UI
     */
    getDisplayData() {
        const session = this.realtimeMetrics.currentSession;
        if (!session) return null;

        const perf = session.timer.getCurrentPerformance();
        if (!perf) return null;

        return {
            elapsed: session.timer.formatTime(perf.elapsed),
            currentRate: `${perf.currentRate.toLocaleString()} attempts/sec`,
            averageRate: `${perf.averageRate.toLocaleString()} attempts/sec`,
            peakRate: `${perf.peakRate.toLocaleString()} attempts/sec`,
            eta: session.timer.getFormattedETA(),
            percentage: `${perf.percentage.toFixed(2)}%`,
            memoryUsage: perf.memoryUsage ? `${perf.memoryUsage.used}MB` : 'N/A',
            trend: session.timer.calculateTrend()
        };
    }

    /**
     * Get session summary
     */
    getSessionSummary() {
        const totalSuccessRate = this.sessionStats.totalAttempts > 0 
            ? (this.sessionStats.successfulAttempts / (this.sessionStats.successfulAttempts + this.sessionStats.failedAttempts)) * 100 
            : 0;

        const avgTimePerAttempt = this.sessionStats.totalAttempts > 0 
            ? this.sessionStats.totalTime / this.sessionStats.totalAttempts * 1000 
            : 0;

        return {
            totalSessions: this.sessionStats.successfulAttempts + this.sessionStats.failedAttempts,
            successRate: Math.round(totalSuccessRate * 100) / 100,
            totalAttempts: this.sessionStats.totalAttempts,
            totalTime: this.sessionStats.totalTime,
            averageTimePerAttempt: Math.round(avgTimePerAttempt * 100) / 100, // ms
            algorithms: Object.entries(this.sessionStats.algorithms).map(([name, stats]) => ({
                name: name.toUpperCase(),
                attempts: stats.attempts,
                successes: stats.successes,
                averageTimePerAttempt: stats.attempts > 0 ? (stats.time / stats.attempts * 1000) : 0,
                successRate: stats.attempts > 0 ? (stats.successes / stats.attempts * 100) : 0
            }))
        };
    }

    /**
     * Export timing data for analysis
     */
    exportTimingData() {
        return {
            exportDate: new Date().toISOString(),
            sessionStats: this.sessionStats,
            realtimeMetrics: {
                rateHistory: this.realtimeMetrics.rateHistory
            },
            currentSession: this.realtimeMetrics.currentSession ? {
                targetPrefix: this.realtimeMetrics.currentSession.targetPrefix,
                algorithm: this.realtimeMetrics.currentSession.algorithm,
                maxAttempts: this.realtimeMetrics.currentSession.maxAttempts,
                checkpoints: this.realtimeMetrics.currentSession.timer.checkpoints,
                performanceMetrics: this.realtimeMetrics.currentSession.timer.performanceMetrics
            } : null
        };
    }

    /**
     * Reset all statistics
     */
    reset() {
        this.sessionStats = {
            totalAttempts: 0,
            totalTime: 0,
            successfulAttempts: 0,
            failedAttempts: 0,
            algorithms: {
                sha256: { attempts: 0, time: 0, successes: 0 },
                sha512: { attempts: 0, time: 0, successes: 0 }
            }
        };
        this.realtimeMetrics = {
            currentSession: null,
            lastRateCheck: 0,
            rateHistory: []
        };
    }
}

/**
 * MicroBenchmark - For detailed operation timing
 */
export class MicroBenchmark {
    constructor() {
        this.benchmarks = new Map();
    }

    /**
     * Run a micro-benchmark
     */
    async benchmark(name, fn, iterations = 1000, warmupIterations = 100) {
        // Warmup
        for (let i = 0; i < warmupIterations; i++) {
            await fn();
        }

        const times = [];
        const startTime = performance.now();

        for (let i = 0; i < iterations; i++) {
            const iterationStart = performance.now();
            await fn();
            const iterationEnd = performance.now();
            times.push(iterationEnd - iterationStart);
        }

        const endTime = performance.now();
        const totalTime = endTime - startTime;

        // Statistical analysis
        times.sort((a, b) => a - b);
        const min = times[0];
        const max = times[times.length - 1];
        const mean = times.reduce((a, b) => a + b) / times.length;
        const median = times[Math.floor(times.length / 2)];
        const p95 = times[Math.floor(times.length * 0.95)];
        const p99 = times[Math.floor(times.length * 0.99)];

        const result = {
            name,
            iterations,
            totalTime,
            statistics: {
                min,
                max,
                mean,
                median,
                p95,
                p99,
                standardDeviation: Math.sqrt(times.reduce((acc, time) => acc + Math.pow(time - mean, 2), 0) / times.length)
            },
            throughput: {
                operationsPerSecond: iterations / (totalTime / 1000),
                averageOperationTime: mean
            }
        };

        this.benchmarks.set(name, result);
        return result;
    }

    /**
     * Compare two benchmarks
     */
    compare(benchmark1Name, benchmark2Name) {
        const bench1 = this.benchmarks.get(benchmark1Name);
        const bench2 = this.benchmarks.get(benchmark2Name);

        if (!bench1 || !bench2) {
            throw new Error('Both benchmarks must exist for comparison');
        }

        return {
            speedup: bench1.statistics.mean / bench2.statistics.mean,
            throughputImprovement: bench2.throughput.operationsPerSecond / bench1.throughput.operationsPerSecond,
            comparison: {
                [benchmark1Name]: bench1.statistics,
                [benchmark2Name]: bench2.statistics
            }
        };
    }

    /**
     * Get all benchmark results
     */
    getAllResults() {
        return Object.fromEntries(this.benchmarks);
    }
}

// Export a global instance for convenience
export const globalTimer = new HashPerformanceAnalyzer();
export const microBench = new MicroBenchmark();
