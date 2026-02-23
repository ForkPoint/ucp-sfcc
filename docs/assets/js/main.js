// Main JavaScript for Documentation Site

(function() {
    'use strict';

    // Smooth scrolling helper function
    const smoothScrollTo = (target, offset = 100) => {
        if (!target) return;

        const elementPosition = target.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - offset;

        window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
        });
    };

    // Add copy button to code blocks
    const codeBlocks = document.querySelectorAll('pre code');
    codeBlocks.forEach(block => {
        const pre = block.parentElement;
        if (pre.tagName === 'PRE') {
            const button = document.createElement('button');
            button.className = 'copy-code-button';
            button.textContent = 'Copy';
            button.setAttribute('aria-label', 'Copy code to clipboard');

            button.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(block.textContent);
                    button.textContent = 'Copied!';
                    setTimeout(() => {
                        button.textContent = 'Copy';
                    }, 2000);
                } catch (err) {
                    console.error('Failed to copy code:', err);
                }
            });

            pre.style.position = 'relative';
            pre.appendChild(button);
        }
    });

    // Generate Table of Contents
    const generateTOC = () => {
        const tocList = document.getElementById('toc-list');
        if (!tocList) return;

        const headings = document.querySelectorAll('.content h2, .content h3');
        if (headings.length === 0) {
            document.getElementById('toc-sidebar')?.style.setProperty('display', 'none');
            return;
        }

        let currentH2 = null;
        headings.forEach((heading, index) => {
            // Generate ID if not present
            if (!heading.id) {
                heading.id = heading.textContent
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '');
            }

            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = `#${heading.id}`;
            a.textContent = heading.textContent;
            a.classList.add('toc-link');
            a.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                // Smooth scroll to the heading
                smoothScrollTo(heading, 100);

                // Update URL
                setTimeout(() => {
                    if (history.pushState) {
                        history.pushState(null, null, `#${heading.id}`);
                    } else {
                        location.hash = heading.id;
                    }
                }, 300);
            });

            if (heading.tagName === 'H2') {
                li.appendChild(a);
                tocList.appendChild(li);
                currentH2 = li;
            } else if (heading.tagName === 'H3' && currentH2) {
                let ul = currentH2.querySelector('ul');
                if (!ul) {
                    ul = document.createElement('ul');
                    currentH2.appendChild(ul);
                }
                li.appendChild(a);
                ul.appendChild(li);
            }
        });
    };

    // Highlight current section in TOC
    const updateActiveTOC = () => {
        const sections = document.querySelectorAll('.content h2[id], .content h3[id]');
        const tocLinks = document.querySelectorAll('#toc-list a');

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    tocLinks.forEach(link => {
                        link.classList.remove('active');
                        if (link.getAttribute('href') === `#${entry.target.id}`) {
                            link.classList.add('active');
                            // Scroll TOC to active item smoothly
                            const tocNav = document.getElementById('toc-nav');
                            if (tocNav) {
                                const linkTop = link.offsetTop;
                                const navHeight = tocNav.clientHeight;
                                const scrollTo = linkTop - (navHeight / 2);
                                tocNav.scrollTo({
                                    top: scrollTo,
                                    behavior: 'smooth'
                                });
                            }
                        }
                    });
                }
            });
        }, {
            rootMargin: '-100px 0px -70% 0px'
        });

        sections.forEach(section => observer.observe(section));
    };

    // Mobile hamburger menu toggle
    const initMobileMenu = () => {
        const menuToggle = document.querySelector('.menu-toggle');
        const siteNav = document.querySelector('.site-nav');
        if (!menuToggle || !siteNav) return;

        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = siteNav.classList.toggle('open');
            menuToggle.classList.toggle('open', isOpen);
            menuToggle.setAttribute('aria-expanded', isOpen);
        });

        // Close menu when clicking a nav link
        siteNav.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                siteNav.classList.remove('open');
                menuToggle.classList.remove('open');
                menuToggle.setAttribute('aria-expanded', 'false');
            });
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!siteNav.contains(e.target) && !menuToggle.contains(e.target)) {
                siteNav.classList.remove('open');
                menuToggle.classList.remove('open');
                menuToggle.setAttribute('aria-expanded', 'false');
            }
        });
    };

    // Mobile TOC toggle
    const initTocToggle = () => {
        const tocToggle = document.getElementById('toc-toggle');
        const tocSidebar = document.getElementById('toc-sidebar');
        if (!tocToggle || !tocSidebar) return;

        tocToggle.addEventListener('click', () => {
            const isOpen = tocSidebar.classList.toggle('open');
            tocToggle.classList.toggle('open', isOpen);
            tocToggle.setAttribute('aria-expanded', isOpen);
        });

        // Close TOC when clicking a TOC link on mobile
        tocSidebar.querySelectorAll('.toc-link').forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    tocSidebar.classList.remove('open');
                    tocToggle.classList.remove('open');
                    tocToggle.setAttribute('aria-expanded', 'false');
                }
            });
        });
    };

    // Initialize on DOM ready
    const init = () => {
        generateTOC();
        updateActiveTOC();
        initMobileMenu();
        initTocToggle();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

