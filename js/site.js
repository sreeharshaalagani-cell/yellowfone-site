/* Yellowfone — bold site shared scripts */

const NAV_HTML = `
<nav class="top">
  <div class="top-inner">
    <a href="index.html" class="brand">
      <span class="brand-mark">☎</span>
      <span>yellowfone</span>
    </a>
    <ul class="top-links">
      <li><a href="product.html" data-page="product">Product</a></li>
      <li><a href="how-it-works.html" data-page="how">How it works</a></li>
      <li><a href="pricing.html" data-page="pricing">Pricing</a></li>
      <li><a href="resources.html" data-page="resources">Resources</a></li>
    </ul>
    <div class="top-cta">
      <a href="#" class="signin">Sign in</a>
      <a href="contact.html" class="btn btn-primary btn-arrow">Book a demo</a>
    </div>
  </div>
</nav>
`;

const FOOTER_HTML = `
<footer>
  <div class="container">
    <div class="foot-grid">
      <div class="foot-col">
        <a href="index.html" class="brand">
          <span class="brand-mark">☎</span>
          <span>yellowfone</span>
        </a>
        <p>The AI voice agent that picks up every call, takes every order, and never asks for a day off.</p>
      </div>
      <div class="foot-col">
        <h5>Product</h5>
        <ul>
          <li><a href="product.html">Capabilities</a></li>
          <li><a href="how-it-works.html">How it works</a></li>
          <li><a href="pricing.html">Pricing</a></li>
          <li><a href="#">Integrations</a></li>
        </ul>
      </div>
      <div class="foot-col">
        <h5>Company</h5>
        <ul>
          <li><a href="#">About</a></li>
          <li><a href="contact.html">Contact</a></li>
          <li><a href="#">Careers</a></li>
        </ul>
      </div>
      <div class="foot-col">
        <h5>Resources</h5>
        <ul>
          <li><a href="resources.html">Blog</a></li>
          <li><a href="#">Docs</a></li>
          <li><a href="#">Status</a></li>
          <li><a href="#">Privacy</a></li>
        </ul>
      </div>
    </div>

    <div class="big-mark">yellow<em>fone</em>.</div>

    <div class="foot-bottom">
      <span>© 2026 Yellowfone, Inc.</span>
      <span>Made for restaurants. Built in Austin.</span>
    </div>
  </div>
</footer>
`;

document.addEventListener('DOMContentLoaded', () => {
  const navMount = document.getElementById('nav-mount');
  const footMount = document.getElementById('footer-mount');
  if (navMount) navMount.innerHTML = NAV_HTML;
  if (footMount) footMount.innerHTML = FOOTER_HTML;

  // active nav link
  const page = document.body.dataset.page;
  if (page) {
    const link = document.querySelector(`.top-links a[data-page="${page}"]`);
    if (link) link.classList.add('active');
  }

  // FAQ toggle
  document.querySelectorAll('.faq-item').forEach(item => {
    item.addEventListener('click', () => item.classList.toggle('open'));
  });

  // Live timer (when present)
  const timer = document.querySelector('.timer');
  if (timer) {
    let t = parseInt(timer.dataset.start || '0', 10);
    setInterval(() => {
      t++;
      const m = String(Math.floor(t / 60)).padStart(2, '0');
      const s = String(t % 60).padStart(2, '0');
      timer.textContent = `${m}:${s}`;
    }, 1000);
  }
});
