export class ThemeManager {
    constructor() {
        this.themes = {
            light: 'light',
            dark: 'dark',
            system: 'system'
        };
        
        this.currentTheme = this.getStoredTheme() || this.themes.system;
        this.systemTheme = this.getSystemTheme();
        this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        
        this.init();
    }

    init() {
        // Listen for system theme changes
        this.mediaQuery.addEventListener('change', (e) => {
            this.systemTheme = e.matches ? 'dark' : 'light';
            if (this.currentTheme === this.themes.system) {
                this.applyTheme();
            }
        });

        // Apply initial theme
        this.applyTheme();
        
        // Update UI if toggle exists
        this.updateThemeToggle();
    }

    getSystemTheme() {
        return this.mediaQuery.matches ? 'dark' : 'light';
    }

    getStoredTheme() {
        try {
            return localStorage.getItem('imghash-theme');
        } catch (error) {
            console.warn('Could not access localStorage for theme preference');
            return null;
        }
    }

    setStoredTheme(theme) {
        try {
            localStorage.setItem('imghash-theme', theme);
        } catch (error) {
            console.warn('Could not save theme preference to localStorage');
        }
    }

    getEffectiveTheme() {
        return this.currentTheme === this.themes.system ? this.systemTheme : this.currentTheme;
    }

    applyTheme() {
        const effectiveTheme = this.getEffectiveTheme();
        const html = document.documentElement;
        
        // Remove existing theme classes
        html.classList.remove('theme-light', 'theme-dark');
        
        // Add current theme class
        html.classList.add(`theme-${effectiveTheme}`);
        
        // Set data attribute for CSS targeting
        html.setAttribute('data-theme', effectiveTheme);
        
        // Dispatch theme change event
        window.dispatchEvent(new CustomEvent('themechange', {
            detail: {
                theme: effectiveTheme,
                userPreference: this.currentTheme
            }
        }));
    }

    setTheme(theme) {
        if (!Object.values(this.themes).includes(theme)) {
            console.error(`Invalid theme: ${theme}`);
            return;
        }

        this.currentTheme = theme;
        this.setStoredTheme(theme);
        this.applyTheme();
        this.updateThemeToggle();
    }

    toggleTheme() {
        const effectiveTheme = this.getEffectiveTheme();
        const newTheme = effectiveTheme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
    }

    cycleTheme() {
        const themes = [this.themes.light, this.themes.dark, this.themes.system];
        const currentIndex = themes.indexOf(this.currentTheme);
        const nextIndex = (currentIndex + 1) % themes.length;
        this.setTheme(themes[nextIndex]);
    }

    updateThemeToggle() {
        const toggleButton = document.getElementById('themeToggle');
        if (!toggleButton) return;

        const effectiveTheme = this.getEffectiveTheme();
        const icons = {
            light: '☀️',
            dark: '🌙',
            system: '🔄'
        };

        const labels = {
            light: 'Light Mode',
            dark: 'Dark Mode', 
            system: 'System Theme'
        };

        // Update button content
        toggleButton.innerHTML = `
            <span class="theme-icon">${icons[this.currentTheme]}</span>
            <span class="theme-label">${labels[this.currentTheme]}</span>
        `;

        // Update tooltip
        toggleButton.title = `Current: ${labels[this.currentTheme]} (${effectiveTheme})`;
        
        // Update button class for styling
        toggleButton.className = `theme-toggle ${effectiveTheme}`;
    }

    createThemeToggle() {
        const toggleHTML = `
            <div class="theme-controls">
                <button id="themeToggle" class="theme-toggle" title="Toggle theme">
                    <span class="theme-icon">🔄</span>
                    <span class="theme-label">System</span>
                </button>
                <div class="theme-dropdown" id="themeDropdown" style="display: none;">
                    <button onclick="themeManager.setTheme('light')" class="theme-option">
                        ☀️ Light Mode
                    </button>
                    <button onclick="themeManager.setTheme('dark')" class="theme-option">
                        🌙 Dark Mode
                    </button>
                    <button onclick="themeManager.setTheme('system')" class="theme-option">
                        🔄 System Theme
                    </button>
                </div>
            </div>
        `;

        // Insert theme toggle in header
        const header = document.querySelector('.header');
        if (header) {
            header.insertAdjacentHTML('beforeend', toggleHTML);
        }

        // Setup event listeners
        this.setupToggleEvents();
        this.updateThemeToggle();
    }

    setupToggleEvents() {
        const toggleButton = document.getElementById('themeToggle');
        const dropdown = document.getElementById('themeDropdown');

        if (toggleButton && dropdown) {
            // Toggle dropdown on click
            toggleButton.addEventListener('click', (e) => {
                e.stopPropagation();
                const isVisible = dropdown.style.display !== 'none';
                dropdown.style.display = isVisible ? 'none' : 'block';
            });

            // Hide dropdown when clicking outside
            document.addEventListener('click', () => {
                dropdown.style.display = 'none';
            });

            // Prevent dropdown from closing when clicking inside
            dropdown.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }
    }

    // Get theme-appropriate colors
    getThemeColors() {
        const effectiveTheme = this.getEffectiveTheme();
        
        if (effectiveTheme === 'dark') {
            return {
                primary: '#667eea',
                secondary: '#764ba2',
                accent: '#f093fb',
                background: '#1a202c',
                surface: '#2d3748',
                text: '#f7fafc',
                textSecondary: '#a0aec0',
                border: '#4a5568',
                success: '#48bb78',
                error: '#f56565',
                warning: '#ed8936',
                info: '#4299e1'
            };
        } else {
            return {
                primary: '#667eea',
                secondary: '#764ba2', 
                accent: '#f093fb',
                background: '#ffffff',
                surface: '#f7fafc',
                text: '#2d3748',
                textSecondary: '#718096',
                border: '#e2e8f0',
                success: '#48bb78',
                error: '#f56565',
                warning: '#ed8936',
                info: '#4299e1'
            };
        }
    }

    // Apply theme to Chart.js charts if available
    updateChartThemes() {
        const colors = this.getThemeColors();
        
        // Dispatch event for chart updates
        window.dispatchEvent(new CustomEvent('chartthemeupdate', {
            detail: { colors }
        }));
    }
}

// Create and export global theme manager instance
const themeManager = new ThemeManager();

// Make globally available
window.themeManager = themeManager;

export { themeManager };
