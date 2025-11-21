// Load navbar and footer components
async function loadComponent(elementId, componentPath) {
  try {
    const response = await fetch(componentPath);
    if (!response.ok) throw new Error(`Failed to load ${componentPath}`);
    const html = await response.text();
    document.getElementById(elementId).innerHTML = html;

    // Update year in footer after loading
    if (elementId === 'footer-placeholder') {
      const yearSpans = document.querySelectorAll('.footer-year');
      yearSpans.forEach(span => span.textContent = new Date().getFullYear());
    }
  } catch (error) {
    console.error('Error loading component:', error);
  }
}

// Load components when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  loadComponent('navbar-placeholder', 'components/navbar.html');
  loadComponent('footer-placeholder', 'components/footer.html');
});
