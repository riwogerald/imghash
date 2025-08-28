/**
 * Performance Analytics Module
 * Tracks performance metrics, success rates, and provides predictive analysis
 */
export class PerformanceAnalytics {
  constructor() {
    this.metrics = {
      attempts: [],
      successes: [],
      failures: [],
      performance: [],
      predictions: {}
    };
    this.charts = {};
    this.storageKey = 'imghash-analytics';
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
   * Record a hash spoofing attempt
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
      fileSize: data.fileSize
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
   * Record performance metrics
   */
  recordPerformance(data) {
    const timestamp = new Date().toISOString();
    const record = {
      timestamp,
      operation: data.operation,
      duration: data.duration,
      throughput: data.throughput,
      memoryUsage: data.memoryUsage
    };

    this.metrics.performance.push(record);
    this.saveData();
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
        predictions: data.predictions || {}
      };
      this.saveData();
      return true;
    }
    return false;
  }
}
