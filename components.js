// Header Component
const headerHTML = `
<nav class="fixed top-0 left-0 right-0 z-50 bg-slate-900/90 backdrop-blur-sm border-b border-slate-800">
    <div class="container mx-auto px-4">
        <div class="flex items-center justify-between h-16">
            <a href="index.html" class="text-white">
                <span class="text-xl font-semibold">Billel Hut - Game Developer</span>
            </a>

            <!-- Desktop Navigation -->
            <div class="hidden md:flex space-x-8">
                <a href="index.html#home" class="text-sm text-slate-300 hover:text-white transition-colors">Home</a>
                <a href="index.html#about" class="text-sm text-slate-300 hover:text-white transition-colors">About</a>
                <a href="projects.html" class="text-sm text-slate-300 hover:text-white transition-colors">Projects</a>
                <a href="projects.html#games" class="text-sm text-slate-300 hover:text-white transition-colors">Games</a>
                <a href="index.html#resume" class="text-sm text-slate-300 hover:text-white transition-colors">Resume</a>
                <a href="index.html#contact" class="text-sm text-slate-300 hover:text-white transition-colors">Contact</a>
            </div>

            <!-- Mobile Menu Button -->
            <button id="mobile-menu-btn" class="md:hidden text-white">
                <i class="fas fa-bars text-xl"></i>
            </button>
        </div>

        <!-- Mobile Navigation -->
        <div id="mobile-menu" class="hidden md:hidden py-4">
            <a href="index.html#home" class="block py-2 px-4 text-slate-300 hover:text-white transition-colors">Home</a>
            <a href="index.html#about" class="block py-2 px-4 text-slate-300 hover:text-white transition-colors">About</a>
            <a href="projects.html" class="block py-2 px-4 text-slate-300 hover:text-white transition-colors">Projects</a>
            <a href="projects.html#games" class="block py-2 px-4 text-slate-300 hover:text-white transition-colors">Games</a>
            <a href="index.html#resume" class="block py-2 px-4 text-slate-300 hover:text-white transition-colors">Resume</a>
            <a href="index.html#contact" class="block py-2 px-4 text-slate-300 hover:text-white transition-colors">Contact</a>
        </div>
    </div>
</nav>
`;

// Footer Component
const footerHTML = `
<footer class="bg-slate-950 text-slate-400 py-8 text-center">
    <p>&copy; 2025 Game Developer Portfolio. All rights reserved.</p>
</footer>
`;

// Load Header
document.getElementById('header').innerHTML = headerHTML;

// Load Footer
document.getElementById('footer').innerHTML = footerHTML;

// Mobile Menu Toggle
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mobileMenu = document.getElementById('mobile-menu');

if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
        const icon = mobileMenuBtn.querySelector('i');
        if (mobileMenu.classList.contains('hidden')) {
            icon.className = 'fas fa-bars text-xl';
        } else {
            icon.className = 'fas fa-times text-xl';
        }
    });
}

// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth'
            });
            // Close mobile menu if open
            if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
                mobileMenu.classList.add('hidden');
                const icon = mobileMenuBtn.querySelector('i');
                icon.className = 'fas fa-bars text-xl';
            }
        }
    });
});
