// Import timer functionality
import { HashingTimer, OperationTimer, MicroBenchmark } from './timer.js';

/**
 * Enhanced Performance Analytics Module
 * Tracks performance metrics, success rates, detailed timing, and provides predictive analysis
 */
export class PerformanceAnalytics {
  constructor() {
    this.metrics = {
      attempts: [],
      successes: [],
      failures: [],
      performance: [],
      predictions: {},
      detailedTiming: [],
      operationBreakdown: [],
      sessionHistory: []
    };
    this.charts = {};
    this.storageKey = 'imghash-analytics';
    this.operationTimer = new OperationTimer();
    this.microBenchmark = new MicroBenchmark();
    this.currentSessionTimer = null;
    this.loadStoredData();
  }

  /**
   * Load previously stored analytics data
   */
  loadStoredData() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        this.metrics = { ...this.metrics, ...data };
      }
    } catch (error) {
      console.warn('Could not load stored analytics data:', error);
    }
  }

  /**
   * Save analytics data to localStorage
   */
  saveData() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.metrics));
    } catch (error) {
      console.warn('Could not save analytics data:', error);
    }
  }

  /**
   * Record a hash spoofing attempt with enhanced timing data
   */
  recordAttempt(data) {
    const timestamp = new Date().toISOString();
    const record = {
      timestamp,
      targetPrefix: data.targetPrefix,
      attempts: data.attempts,
      duration: data.duration,
      success: data.success,
      hashAlgorithm: data.hashAlgorithm,
      imageFormat: data.imageFormat,
      fileSize: data.fileSize,
      // Enhanced timing data
      timingBreakdown: data.timingBreakdown || null,
      performanceMetrics: {
        attemptsPerSecond: data.attempts > 0 ? data.attempts / (data.duration / 1000) : 0,
        averageTimePerAttempt: data.attempts > 0 ? data.duration / data.attempts : 0,
        memoryUsage: data.memoryUsage || null,
        cpuUtilization: data.cpuUtilization || null
      }
    };

    this.metrics.attempts.push(record);

    if (data.success) {
      this.metrics.successes.push(record);
    } else {
      this.metrics.failures.push(record);
    }

    this.updatePredictions();
    this.saveData();
  }

  /**
   * Record detailed performance metrics with timing breakdown
   */
  recordPerformance(data) {
    const timestamp = new Date().toISOString();
    const record = {
      timestamp,
      operation: data.operation,
      duration: data.duration,
      throughput: data.throughput,
      memoryUsage: data.memoryUsage,
      // Enhanced performance data
      operationBreakdown: data.operationBreakdown || {},
      systemMetrics: {
        cpuCores: navigator.hardwareConcurrency || 'unknown',
        userAgent: navigator.userAgent,
        memoryLimit: performance.memory?.jsHeapSizeLimit || null
      },
      timingStatistics: data.timingStatistics || null
    };

    this.metrics.performance.push(record);
    this.saveData();
  }

  /**
   * Record detailed timing breakdown for analysis
   */
  recordDetailedTiming(data) {
    const timestamp = new Date().toISOString();
    const record = {
      timestamp,
      sessionId: data.sessionId,
      targetPrefix: data.targetPrefix,
      algorithm: data.algorithm,
      timingBreakdown: {
        imageProcessing: data.imageProcessingTime || 0,
        hashCalculation: data.hashCalculationTime || 0,
        memoryOperations: data.memoryOperationsTime || 0,
        totalAttemptTime: data.totalAttemptTime || 0
      },
      performanceMetrics: {
        attemptsPerSecond: data.attemptsPerSecond || 0,
        averageTimePerAttempt: data.averageTimePerAttempt || 0,
        peakRate: data.peakRate || 0,
        memoryEfficiency: data.memoryEfficiency || null
      },
      systemState: {
        memoryUsage: data.memoryUsage || null,
        activeWorkers: data.activeWorkers || 1,
        cpuLoad: data.cpuLoad || null
      }
    };
    
    this.metrics.detailedTiming.push(record);
    this.saveData();
  }

  /**
   * Start a new performance session
   */
  startSession(targetPrefix, algorithm, maxAttempts) {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.currentSessionTimer = new HashingTimer();
    this.currentSessionTimer.start();
    
    const session = {
      sessionId,
      startTime: new Date().toISOString(),
      targetPrefix,
      algorithm,
      maxAttempts,
      timer: this.currentSessionTimer,
      checkpoints: [],
      endTime: null,
      finalResult: null
    };
    
    this.metrics.sessionHistory.push(session);
    return session;
  }

  /**
   * Update current session progress
   */
  updateSessionProgress(attempt, additionalData = {}) {
    if (!this.currentSessionTimer) return null;
    
    const currentSession = this.metrics.sessionHistory[this.metrics.sessionHistory.length - 1];
    if (!currentSession) return null;
    
    const checkpoint = this.currentSessionTimer.addCheckpoint(
      'progress',
      attempt,
      currentSession.maxAttempts,
      additionalData
    );
    
    currentSession.checkpoints.push(checkpoint);
    this.saveData();
    
    return checkpoint;
  }

  /**
   * End current performance session
   */
  endSession(success, finalAttempts, finalHash = null, additionalData = {}) {
    if (!this.currentSessionTimer) return null;
    
    const currentSession = this.metrics.sessionHistory[this.metrics.sessionHistory.length - 1];
    if (!currentSession) return null;
    
    this.currentSessionTimer.stop();
    
    currentSession.endTime = new Date().toISOString();
    currentSession.finalResult = {
      success,
      attempts: finalAttempts,
      hash: finalHash,
      performanceReport: this.currentSessionTimer.getPerformanceReport(),
      statistics: this.currentSessionTimer.getStatistics(),
      ...additionalData
    };
    
    // Record detailed timing for this session
    this.recordDetailedTiming({
      sessionId: currentSession.sessionId,
      targetPrefix: currentSession.targetPrefix,
      algorithm: currentSession.algorithm,
      attemptsPerSecond: finalAttempts / (currentSession.finalResult.performanceReport.duration),
      averageTimePerAttempt: (currentSession.finalResult.performanceReport.duration * 1000) / finalAttempts,
      peakRate: currentSession.finalResult.performanceReport.peakRate,
      memoryUsage: currentSession.finalResult.memoryUsage,
      ...additionalData
    });
    
    this.currentSessionTimer = null;
    this.saveData();
    
    return currentSession.finalResult;
  }

  /**
   * Calculate success rate for a given prefix length
   */
  getSuccessRateByPrefixLength(prefixLength) {
    const attempts = this.metrics.attempts.filter(a => 
      a.targetPrefix.replace('0x', '').length === prefixLength
    );
    
    if (attempts.length === 0) return null;
    
    const successes = attempts.filter(a => a.success).length;
    return {
      rate: (successes / attempts.length) * 100,
      attempts: attempts.length,
      successes
    };
  }

  /**
   * Predict expected attempts for a given prefix
   */
  predictAttempts(targetPrefix) {
    const prefixWithout0x = targetPrefix.replace('0x', '');
    const prefixLength = prefixWithout0x.length;
    
    // Theoretical calculation: 16^length attempts on average
    const theoreticalAttempts = Math.pow(16, prefixLength);
    
    // Adjust based on historical data
    const historicalData = this.getSuccessRateByPrefixLength(prefixLength);
    let adjustmentFactor = 1;
    
    if (historicalData && historicalData.attempts > 5) {
      const avgAttemptsFromHistory = this.metrics.successes
        .filter(s => s.targetPrefix.replace('0x', '').length === prefixLength)
        .reduce((sum, s) => sum + s.attempts, 0) / historicalData.successes;
      
      if (avgAttemptsFromHistory > 0) {
        adjustmentFactor = avgAttemptsFromHistory / theoreticalAttempts;
      }
    }

    const prediction = {
      theoretical: theoreticalAttempts,
      predicted: Math.round(theoreticalAttempts * adjustmentFactor),
      confidence: historicalData ? Math.min(historicalData.attempts / 10, 1) : 0.1,
      basedOnSamples: historicalData ? historicalData.attempts : 0
    };

    return prediction;
  }

  /**
   * Estimate processing time based on historical performance
   */
  estimateProcessingTime(targetPrefix, hashAlgorithm = 'sha512') {
    const prediction = this.predictAttempts(targetPrefix);
    
    // Get average performance metrics
    const perfData = this.metrics.performance.filter(p => 
      p.operation === 'hash_calculation' || p.operation === 'attempt'
    );
    
    let avgTimePerAttempt = 1; // Default 1ms per attempt
    if (perfData.length > 0) {
      avgTimePerAttempt = perfData.reduce((sum, p) => sum + p.duration, 0) / perfData.length;
    }

    // Adjust for hash algorithm
    const algorithmMultiplier = hashAlgorithm === 'sha512' ? 1.2 : 1.0;
    
    return {
      estimatedMs: prediction.predicted * avgTimePerAttempt * algorithmMultiplier,
      estimatedSeconds: Math.round((prediction.predicted * avgTimePerAttempt * algorithmMultiplier) / 1000),
      confidence: prediction.confidence
    };
  }

  /**
   * Update prediction models based on latest data
   */
  updatePredictions() {
    const prefixLengths = [1, 2, 3, 4, 5, 6];
    
    prefixLengths.forEach(length => {
      const data = this.getSuccessRateByPrefixLength(length);
      if (data) {
        this.metrics.predictions[`length_${length}`] = {
          successRate: data.rate,
          avgAttempts: this.metrics.successes
            .filter(s => s.targetPrefix.replace('0x', '').length === length)
            .reduce((sum, s) => sum + s.attempts, 0) / data.successes,
          sampleSize: data.attempts,
          lastUpdated: new Date().toISOString()
        };
      }
    });
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats() {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;
    const oneMonth = 30 * oneDay;

    const filterByTime = (data, timeframe) => {
      return data.filter(item => {
        const itemTime = new Date(item.timestamp).getTime();
        return now - itemTime <= timeframe;
      });
    };

    return {
      total: {
        attempts: this.metrics.attempts.length,
        successes: this.metrics.successes.length,
        failures: this.metrics.failures.length,
        successRate: this.metrics.attempts.length > 0 ? 
          (this.metrics.successes.length / this.metrics.attempts.length) * 100 : 0
      },
      today: {
        attempts: filterByTime(this.metrics.attempts, oneDay).length,
        successes: filterByTime(this.metrics.successes, oneDay).length,
        failures: filterByTime(this.metrics.failures, oneDay).length
      },
      thisWeek: {
        attempts: filterByTime(this.metrics.attempts, oneWeek).length,
        successes: filterByTime(this.metrics.successes, oneWeek).length,
        failures: filterByTime(this.metrics.failures, oneWeek).length
      },
      thisMonth: {
        attempts: filterByTime(this.metrics.attempts, oneMonth).length,
        successes: filterByTime(this.metrics.successes, oneMonth).length,
        failures: filterByTime(this.metrics.failures, oneMonth).length
      }
    };
  }

  /**
   * Get chart data for visualization
   */
  getChartData() {
    const stats = this.getPerformanceStats();
    const now = new Date();
    
    // Success rate over time (last 30 days)
    const dailyStats = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      
      const dayAttempts = this.metrics.attempts.filter(a => {
        const attemptTime = new Date(a.timestamp);
        return attemptTime >= dayStart && attemptTime < dayEnd;
      });
      
      const daySuccesses = dayAttempts.filter(a => a.success);
      
      dailyStats.push({
        date: date.toISOString().split('T')[0],
        attempts: dayAttempts.length,
        successes: daySuccesses.length,
        successRate: dayAttempts.length > 0 ? (daySuccesses.length / dayAttempts.length) * 100 : 0
      });
    }

    // Performance by prefix length
    const prefixStats = [1, 2, 3, 4, 5, 6].map(length => ({
      prefixLength: length,
      ...this.getSuccessRateByPrefixLength(length)
    })).filter(s => s.rate !== null);

    // Algorithm performance comparison
    const algorithmStats = ['sha256', 'sha512'].map(algo => {
      const algoAttempts = this.metrics.attempts.filter(a => a.hashAlgorithm === algo);
      const algoSuccesses = algoAttempts.filter(a => a.success);
      
      return {
        algorithm: algo,
        attempts: algoAttempts.length,
        successes: algoSuccesses.length,
        avgDuration: algoAttempts.length > 0 ? 
          algoAttempts.reduce((sum, a) => sum + (a.duration || 0), 0) / algoAttempts.length : 0,
        successRate: algoAttempts.length > 0 ? (algoSuccesses.length / algoAttempts.length) * 100 : 0
      };
    });

    return {
      dailyStats,
      prefixStats,
      algorithmStats,
      overallStats: stats
    };
  }

  /**
   * Clear all analytics data
   */
  clearData() {
    this.metrics = {
      attempts: [],
      successes: [],
      failures: [],
      performance: [],
      predictions: {}
    };
    localStorage.removeItem(this.storageKey);
  }

  /**
   * Export analytics data
   */
  exportData() {
    return {
      exportDate: new Date().toISOString(),
      ...this.metrics,
      statistics: this.getPerformanceStats(),
      chartData: this.getChartData()
    };
  }

  /**
   * Import analytics data
   */
  importData(data) {
    if (data && typeof data === 'object') {
      this.metrics = {
        attempts: data.attempts || [],
        successes: data.successes || [],
        failures: data.failures || [],
        performance: data.performance || [],
        predictions: data.predictions || {},
        detailedTiming: data.detailedTiming || [],
        operationBreakdown: data.operationBreakdown || [],
        sessionHistory: data.sessionHistory || []
      };
      this.saveData();
      return true;
    }
    return false;
  }

  /**
   * Get detailed timing analysis
   */
  getTimingAnalysis() {
    const timingData = this.metrics.detailedTiming || [];
    
    if (timingData.length === 0) {
      return {
        hasData: false,
        message: 'No timing data available'
      };
    }

    // Analyze performance by algorithm
    const algorithmAnalysis = {};
    ['sha256', 'sha512'].forEach(algo => {
      const algoData = timingData.filter(t => t.algorithm === algo);
      if (algoData.length > 0) {
        const rates = algoData.map(t => t.performanceMetrics.attemptsPerSecond);
        const avgTimes = algoData.map(t => t.performanceMetrics.averageTimePerAttempt);
        
        algorithmAnalysis[algo] = {
          sessions: algoData.length,
          averageRate: rates.reduce((a, b) => a + b) / rates.length,
          minRate: Math.min(...rates),
          maxRate: Math.max(...rates),
          averageTimePerAttempt: avgTimes.reduce((a, b) => a + b) / avgTimes.length,
          reliability: this.calculateReliability(rates)
        };
      }
    });

    // Analyze performance trends
    const recentSessions = timingData.slice(-10);
    const performanceTrend = this.analyzeTrend(
      recentSessions.map(t => t.performanceMetrics.attemptsPerSecond)
    );

    // Memory usage analysis
    const memoryData = timingData
      .filter(t => t.systemState.memoryUsage)
      .map(t => t.systemState.memoryUsage.used);
    
    const memoryAnalysis = memoryData.length > 0 ? {
      average: memoryData.reduce((a, b) => a + b) / memoryData.length,
      min: Math.min(...memoryData),
      max: Math.max(...memoryData),
      trend: this.analyzeTrend(memoryData)
    } : null;

    return {
      hasData: true,
      totalSessions: timingData.length,
      algorithmAnalysis,
      performanceTrend,
      memoryAnalysis,
      recommendations: this.generatePerformanceRecommendations(algorithmAnalysis, performanceTrend)
    };
  }

  /**
   * Calculate reliability score based on performance consistency
   */
  calculateReliability(values) {
    if (values.length < 2) return 1;
    
    const mean = values.reduce((a, b) => a + b) / values.length;
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / mean;
    
    // Lower coefficient of variation = higher reliability
    return Math.max(0, 1 - coefficientOfVariation);
  }

  /**
   * Analyze trend in performance data
   */
  analyzeTrend(values) {
    if (values.length < 3) return 'insufficient_data';
    
    const recentValues = values.slice(-5);
    let increasing = 0;
    let decreasing = 0;
    
    for (let i = 1; i < recentValues.length; i++) {
      if (recentValues[i] > recentValues[i - 1]) {
        increasing++;
      } else if (recentValues[i] < recentValues[i - 1]) {
        decreasing++;
      }
    }
    
    if (increasing > decreasing) return 'improving';
    if (decreasing > increasing) return 'declining';
    return 'stable';
  }

  /**
   * Generate performance recommendations based on analysis
   */
  generatePerformanceRecommendations(algorithmAnalysis, performanceTrend) {
    const recommendations = [];
    
    // Algorithm comparison
    if (algorithmAnalysis.sha256 && algorithmAnalysis.sha512) {
      const sha256Rate = algorithmAnalysis.sha256.averageRate;
      const sha512Rate = algorithmAnalysis.sha512.averageRate;
      
      if (sha256Rate > sha512Rate * 1.2) {
        recommendations.push({
          type: 'algorithm',
          priority: 'medium',
          message: 'SHA-256 performs significantly better than SHA-512 in your environment. Consider using SHA-256 for better performance.'
        });
      } else if (sha512Rate > sha256Rate * 1.2) {
        recommendations.push({
          type: 'algorithm',
          priority: 'medium',
          message: 'SHA-512 performs better than SHA-256 in your environment, which is unusual. Your hardware may have optimizations for SHA-512.'
        });
      }
    }
    
    // Performance trend analysis
    if (performanceTrend === 'declining') {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        message: 'Performance has been declining in recent sessions. Consider restarting your browser or closing other applications to free up resources.'
      });
    } else if (performanceTrend === 'improving') {
      recommendations.push({
        type: 'performance',
        priority: 'low',
        message: 'Performance has been improving! Current optimization strategies are working well.'
      });
    }
    
    // Reliability analysis
    Object.entries(algorithmAnalysis).forEach(([algo, analysis]) => {
      if (analysis.reliability < 0.7) {
        recommendations.push({
          type: 'reliability',
          priority: 'medium',
          message: `${algo.toUpperCase()} performance is inconsistent. This might indicate system resource contention or thermal throttling.`
        });
      }
    });
    
    return recommendations;
  }

  /**
   * Get operation breakdown analysis
   */
  getOperationBreakdown() {
    const operationStats = this.operationTimer.getAllStats();
    const summary = this.operationTimer.getPerformanceSummary();
    
    return {
      operations: operationStats,
      summary,
      bottlenecks: summary.hottestOperations,
      recommendations: this.generateOperationRecommendations(summary.hottestOperations)
    };
  }

  /**
   * Generate recommendations based on operation analysis
   */
  generateOperationRecommendations(hottestOperations) {
    const recommendations = [];
    
    hottestOperations.forEach((op, index) => {
      if (index === 0) { // Biggest bottleneck
        recommendations.push({
          type: 'bottleneck',
          priority: 'high',
          operation: op.name,
          message: `${op.name} is your biggest performance bottleneck, taking ${(op.totalTime).toFixed(2)}s total time across ${op.calls} calls.`
        });
      }
      
      if (op.averageTime > 50) { // Operations taking more than 50ms on average
        recommendations.push({
          type: 'optimization',
          priority: 'medium',
          operation: op.name,
          message: `${op.name} takes an average of ${op.averageTime.toFixed(2)}ms per call. Consider optimizing this operation.`
        });
      }
    });
    
    return recommendations;
  }

  /**
   * Run micro-benchmarks on key operations
   */
  async runMicroBenchmarks() {
    const results = {};
    
    // Benchmark hash algorithms
    const testData = new Uint8Array(1024).fill(42);
    
    try {
      // SHA-256 benchmark
      results.sha256 = await this.microBenchmark.benchmark(
        'sha256_hash',
        async () => {
          await crypto.subtle.digest('SHA-256', testData);
        },
        1000,
        100
      );
      
      // SHA-512 benchmark
      results.sha512 = await this.microBenchmark.benchmark(
        'sha512_hash',
        async () => {
          await crypto.subtle.digest('SHA-512', testData);
        },
        1000,
        100
      );
      
      // Array operations benchmark
      results.arrayOperations = await this.microBenchmark.benchmark(
        'array_operations',
        () => {
          const arr = new Uint8Array(1000);
          arr.fill(Math.random() * 255);
          return arr;
        },
        10000,
        1000
      );
      
      // Store benchmark results
      this.recordPerformance({
        operation: 'micro_benchmark',
        duration: 0,
        throughput: 0,
        operationBreakdown: results,
        timingStatistics: {
          sha256: results.sha256.statistics,
          sha512: results.sha512.statistics,
          arrayOps: results.arrayOperations.statistics
        }
      });
      
    } catch (error) {
      console.warn('Micro-benchmark failed:', error);
      results.error = error.message;
    }
    
    return results;
  }

  /**
   * Get comprehensive performance report
   */
  getComprehensiveReport() {
    return {
      basicStats: this.getPerformanceStats(),
      timingAnalysis: this.getTimingAnalysis(),
      operationBreakdown: this.getOperationBreakdown(),
      chartData: this.getChartData(),
      sessionSummary: {
        totalSessions: this.metrics.sessionHistory.length,
        recentSessions: this.metrics.sessionHistory.slice(-5),
        avgSessionDuration: this.metrics.sessionHistory.length > 0 ?
          this.metrics.sessionHistory
            .filter(s => s.finalResult)
            .reduce((sum, s) => sum + s.finalResult.performanceReport.duration, 0) / 
            this.metrics.sessionHistory.filter(s => s.finalResult).length : 0
      },
      exportTimestamp: new Date().toISOString()
    };
  }
}
