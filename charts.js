import { Chart, registerables } from 'chart.js';

// Register Chart.js components
Chart.register(...registerables);

/**
 * Chart Visualization Manager
 * Creates and manages interactive charts for performance analytics
 */
export class ChartManager {
  constructor(analytics) {
    this.analytics = analytics;
    this.charts = new Map();
    this.colors = {
      primary: 'rgba(102, 126, 234, 0.8)',
      primaryBorder: 'rgba(102, 126, 234, 1)',
      secondary: 'rgba(118, 75, 162, 0.8)',
      secondaryBorder: 'rgba(118, 75, 162, 1)',
      success: 'rgba(34, 197, 94, 0.8)',
      successBorder: 'rgba(34, 197, 94, 1)',
      warning: 'rgba(251, 146, 60, 0.8)',
      warningBorder: 'rgba(251, 146, 60, 1)',
      error: 'rgba(239, 68, 68, 0.8)',
      errorBorder: 'rgba(239, 68, 68, 1)',
      info: 'rgba(59, 130, 246, 0.8)',
      infoBorder: 'rgba(59, 130, 246, 1)',
      gradient: ['rgba(102, 126, 234, 0.8)', 'rgba(118, 75, 162, 0.8)', 'rgba(240, 147, 251, 0.8)']
    };
  }

  /**
   * Create success rate over time chart
   */
  createSuccessRateChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const chartData = this.analytics.getChartData();
    const ctx = canvas.getContext('2d');

    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, this.colors.primary);
    gradient.addColorStop(1, 'rgba(102, 126, 234, 0.1)');

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartData.dailyStats.map(d => d.date),
        datasets: [{
          label: 'Success Rate (%)',
          data: chartData.dailyStats.map(d => d.successRate),
          borderColor: this.colors.primaryBorder,
          backgroundColor: gradient,
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: this.colors.primaryBorder,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6
        }, {
          label: 'Daily Attempts',
          data: chartData.dailyStats.map(d => d.attempts),
          borderColor: this.colors.secondaryBorder,
          backgroundColor: this.colors.secondary,
          borderWidth: 1,
          fill: false,
          tension: 0.2,
          yAxisID: 'y1'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: '📈 Success Rate Over Time (Last 30 Days)',
            font: { size: 16, weight: 'bold' },
            padding: 20
          },
          legend: {
            display: true,
            position: 'top',
            labels: {
              usePointStyle: true,
              padding: 20
            }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            titleColor: '#1f2937',
            bodyColor: '#1f2937',
            borderColor: this.colors.primaryBorder,
            borderWidth: 1,
            cornerRadius: 8,
            displayColors: true
          }
        },
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: 'Date'
            },
            grid: {
              color: 'rgba(0, 0, 0, 0.1)'
            }
          },
          y: {
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'Success Rate (%)'
            },
            grid: {
              color: 'rgba(0, 0, 0, 0.1)'
            },
            min: 0,
            max: 100
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Attempts'
            },
            grid: {
              drawOnChartArea: false,
            },
            min: 0
          }
        },
        interaction: {
          mode: 'nearest',
          axis: 'x',
          intersect: false
        }
      }
    });

    this.charts.set(canvasId, chart);
    return chart;
  }

  /**
   * Create prefix difficulty chart
   */
  createPrefixDifficultyChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const chartData = this.analytics.getChartData();
    const ctx = canvas.getContext('2d');

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: chartData.prefixStats.map(p => `${p.prefixLength} chars`),
        datasets: [{
          label: 'Success Rate (%)',
          data: chartData.prefixStats.map(p => p.rate),
          backgroundColor: this.colors.gradient,
          borderColor: chartData.prefixStats.map((_, i) => this.colors.gradient[i % this.colors.gradient.length].replace('0.8', '1')),
          borderWidth: 2,
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: '🎯 Success Rate by Prefix Length',
            font: { size: 16, weight: 'bold' },
            padding: 20
          },
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            titleColor: '#1f2937',
            bodyColor: '#1f2937',
            borderColor: this.colors.primaryBorder,
            borderWidth: 1,
            cornerRadius: 8,
            callbacks: {
              afterBody: (context) => {
                const data = chartData.prefixStats[context[0].dataIndex];
                return [
                  `Attempts: ${data.attempts}`,
                  `Successes: ${data.successes}`,
                  `Theoretical difficulty: 1 in ${Math.pow(16, data.prefixLength).toLocaleString()}`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: 'Prefix Length'
            },
            grid: {
              display: false
            }
          },
          y: {
            display: true,
            title: {
              display: true,
              text: 'Success Rate (%)'
            },
            grid: {
              color: 'rgba(0, 0, 0, 0.1)'
            },
            min: 0,
            max: 100
          }
        }
      }
    });

    this.charts.set(canvasId, chart);
    return chart;
  }

  /**
   * Create algorithm performance comparison chart
   */
  createAlgorithmComparisonChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const chartData = this.analytics.getChartData();
    const ctx = canvas.getContext('2d');

    const chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: chartData.algorithmStats.map(a => a.algorithm.toUpperCase()),
        datasets: [{
          data: chartData.algorithmStats.map(a => a.attempts),
          backgroundColor: [this.colors.primary, this.colors.secondary],
          borderColor: [this.colors.primaryBorder, this.colors.secondaryBorder],
          borderWidth: 2,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: '⚡ Algorithm Usage Distribution',
            font: { size: 16, weight: 'bold' },
            padding: 20
          },
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              padding: 20,
              usePointStyle: true
            }
          },
          tooltip: {
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            titleColor: '#1f2937',
            bodyColor: '#1f2937',
            borderColor: this.colors.primaryBorder,
            borderWidth: 1,
            cornerRadius: 8,
            callbacks: {
              label: (context) => {
                const data = chartData.algorithmStats[context.dataIndex];
                const percentage = ((data.attempts / chartData.algorithmStats.reduce((sum, a) => sum + a.attempts, 0)) * 100).toFixed(1);
                return [
                  `${data.algorithm.toUpperCase()}: ${data.attempts} attempts (${percentage}%)`,
                  `Success Rate: ${data.successRate.toFixed(1)}%`,
                  `Avg Duration: ${data.avgDuration.toFixed(2)}ms`
                ];
              }
            }
          }
        },
        cutout: '60%'
      }
    });

    this.charts.set(canvasId, chart);
    return chart;
  }

  /**
   * Create performance metrics dashboard
   */
  createPerformanceDashboard(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const perfData = this.analytics.metrics.performance.slice(-50); // Last 50 measurements
    const ctx = canvas.getContext('2d');

    const chart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Hash Calculation',
          data: perfData
            .filter(p => p.operation === 'hash_calculation')
            .map((p, i) => ({ x: i, y: p.duration })),
          backgroundColor: this.colors.info,
          borderColor: this.colors.infoBorder,
          pointRadius: 4
        }, {
          label: 'Image Processing',
          data: perfData
            .filter(p => p.operation === 'image_processing')
            .map((p, i) => ({ x: i, y: p.duration })),
          backgroundColor: this.colors.warning,
          borderColor: this.colors.warningBorder,
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: '📊 Performance Metrics Over Time',
            font: { size: 16, weight: 'bold' },
            padding: 20
          },
          legend: {
            display: true,
            position: 'top'
          },
          tooltip: {
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            titleColor: '#1f2937',
            bodyColor: '#1f2937',
            borderColor: this.colors.primaryBorder,
            borderWidth: 1,
            cornerRadius: 8
          }
        },
        scales: {
          x: {
            type: 'linear',
            display: true,
            title: {
              display: true,
              text: 'Measurement #'
            }
          },
          y: {
            display: true,
            title: {
              display: true,
              text: 'Duration (ms)'
            },
            min: 0
          }
        }
      }
    });

    this.charts.set(canvasId, chart);
    return chart;
  }

  /**
   * Update all charts with latest data
   */
  updateAllCharts() {
    const chartData = this.analytics.getChartData();
    
    this.charts.forEach((chart, canvasId) => {
      if (canvasId.includes('success-rate')) {
        chart.data.labels = chartData.dailyStats.map(d => d.date);
        chart.data.datasets[0].data = chartData.dailyStats.map(d => d.successRate);
        chart.data.datasets[1].data = chartData.dailyStats.map(d => d.attempts);
      } else if (canvasId.includes('prefix-difficulty')) {
        chart.data.labels = chartData.prefixStats.map(p => `${p.prefixLength} chars`);
        chart.data.datasets[0].data = chartData.prefixStats.map(p => p.rate);
      } else if (canvasId.includes('algorithm-comparison')) {
        chart.data.labels = chartData.algorithmStats.map(a => a.algorithm.toUpperCase());
        chart.data.datasets[0].data = chartData.algorithmStats.map(a => a.attempts);
      }
      
      chart.update('none'); // Update without animation for better performance
    });
  }

  /**
   * Destroy a specific chart
   */
  destroyChart(canvasId) {
    const chart = this.charts.get(canvasId);
    if (chart) {
      chart.destroy();
      this.charts.delete(canvasId);
    }
  }

  /**
   * Destroy all charts
   */
  destroyAllCharts() {
    this.charts.forEach((chart) => {
      chart.destroy();
    });
    this.charts.clear();
  }

  /**
   * Resize charts (call when container size changes)
   */
  resizeCharts() {
    this.charts.forEach((chart) => {
      chart.resize();
    });
  }

  /**
   * Create prediction visualization
   */
  createPredictionChart(canvasId, targetPrefix) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const prediction = this.analytics.predictAttempts(targetPrefix);
    const timeEstimate = this.analytics.estimateProcessingTime(targetPrefix);
    
    const ctx = canvas.getContext('2d');

    const data = {
      labels: ['Theoretical', 'Predicted', 'Confidence Range'],
      datasets: [{
        label: 'Expected Attempts',
        data: [
          prediction.theoretical,
          prediction.predicted,
          prediction.predicted * (1 + (1 - prediction.confidence))
        ],
        backgroundColor: [
          this.colors.info,
          this.colors.primary,
          this.colors.warning
        ],
        borderColor: [
          this.colors.infoBorder,
          this.colors.primaryBorder,
          this.colors.warningBorder
        ],
        borderWidth: 2
      }]
    };

    const chart = new Chart(ctx, {
      type: 'bar',
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          title: {
            display: true,
            text: `🔮 Prediction for "${targetPrefix}"`,
            font: { size: 16, weight: 'bold' },
            padding: 20
          },
          tooltip: {
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            titleColor: '#1f2937',
            bodyColor: '#1f2937',
            borderColor: this.colors.primaryBorder,
            borderWidth: 1,
            cornerRadius: 8,
            callbacks: {
              afterBody: () => [
                `Estimated time: ${timeEstimate.estimatedSeconds}s`,
                `Confidence: ${Math.round(prediction.confidence * 100)}%`,
                `Based on ${prediction.basedOnSamples} samples`
              ]
            }
          }
        },
        scales: {
          x: {
            type: 'logarithmic',
            display: true,
            title: {
              display: true,
              text: 'Expected Attempts (log scale)'
            }
          },
          y: {
            display: true
          }
        }
      }
    });

    this.charts.set(canvasId, chart);
    return chart;
  }
}
