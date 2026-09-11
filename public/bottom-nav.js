document.addEventListener('DOMContentLoaded', () => {
  const navItems = document.querySelectorAll('.nav-item');
  const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';

  navItems.forEach(item => {
    const page = item.getAttribute('data-page');

    if (page === currentPage) {
      item.classList.add('active');
    }

    item.addEventListener('click', () => {
      if (page !== currentPage) {
        window.location.href = page;
      }
    });
  });
});
