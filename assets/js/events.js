/**
 * Events display module for Coimbra Tech Afterhours
 * Fetches events from public/events.json and renders them
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    MAX_HOME_EVENTS: 3,     // Number of upcoming events to show on homepage
    EVENTS_JSON_PATH: '/public/events.json'
  };

  // i18n strings
  const i18n = {
    pt: {
      noUpcoming: 'Ainda não há eventos marcados. Junta-te ao WhatsApp para saber quando abrirem novas datas.',
      noPast: 'Ainda sem arquivo',
      details: 'Ver detalhes / RSVP',
      comingSoon: 'Brevemente',
      organizerCTA: 'Organizas eventos em Coimbra?',
      organizerCTAText: 'Entra em contacto connosco para partilhares o teu evento na nossa comunidade.',
      organizerCTAButton: 'Contactar'
    },
    en: {
      noUpcoming: 'No upcoming events right now. Join the WhatsApp group to stay tuned.',
      noPast: 'No past events yet',
      details: 'View details / RSVP',
      comingSoon: 'Coming soon',
      organizerCTA: 'Organizing events in Coimbra?',
      organizerCTAText: 'Get in touch with us to share your event with our community.',
      organizerCTAButton: 'Get in touch'
    }
  };

  /**
   * Get current language from page
   */
  function getCurrentLang() {
    const activeLang = document.querySelector('[data-lang].active');
    if (activeLang) {
      return activeLang.getAttribute('data-lang') || 'pt';
    }
    return document.documentElement.lang || 'pt';
  }

  /**
   * Update i18n attributes on elements
   */
  function updateI18n() {
    const lang = getCurrentLang();
    document.querySelectorAll('[data-i18n-pt], [data-i18n-en]').forEach(el => {
      const attr = `data-i18n-${lang}`;
      const text = el.getAttribute(attr);
      if (text) {
        el.textContent = text;
      }
    });
  }

  /**
   * Get first value from array or null
   */
  function firstOrNull(arr) {
    return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
  }

  /**
   * Format event data from JSON
   */
  function formatEvent(event) {
    return {
      name: event.Name || '',
      type: event.Type || '',
      status: event.Status || '',
      dateISO: event.Date || '',
      datePretty: event.datePretty || '',
      lang: Array.isArray(event.Language) ? event.Language : [],
      link: event.Link || null
    };
  }

  /**
   * Format languages array to string with flag emojis
   */
  function formatLanguages(langArray) {
    if (!Array.isArray(langArray) || langArray.length === 0) return '';
    
    const flagMap = {
      'PT': '🇵🇹',
      'EN': '🇬🇧',
      'ES': '🇪🇸',
      'FR': '🇫🇷'
    };
    
    return langArray
      .map(lang => flagMap[lang] || lang)
      .join(' ');
  }

  /**
   * Get type label
   */
  function typeLabelFor(type) {
    return type || '';
  }

  /**
   * Check if event is partner event
   */
  function isPartner(type) {
    return type === 'Partner Event';
  }

  /**
   * SVG icon templates
   */
  const icons = {
    calendar: '<svg aria-hidden="true" class="icon icon--calendar" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',
    globe: '<svg aria-hidden="true" class="icon icon--globe" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>',
    chat: '<svg aria-hidden="true" class="icon icon--chat" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>'
  };

  /**
   * Create event row HTML (simple list format)
   */
  function createEventRow(event, lang) {
    const t = i18n[lang];
    const typeLabel = typeLabelFor(event.type);
    const isPartnerEvent = isPartner(event.type);
    const languages = formatLanguages(event.lang);
    const hasLink = !!event.link;
    const statusClass = event.status === 'Upcoming' ? 'is-upcoming' : 'is-past';
    const typeClass = isPartnerEvent ? 'type-partner' : 'type-afterhours';

    const dateHTML = event.dateISO
      ? `<time datetime="${event.dateISO}">${event.datePretty}</time>`
      : event.datePretty;

    const languagesHTML = languages || '';

    const ctaHTML = hasLink
      ? `<a class="link-cta" href="${event.link}" target="_blank" rel="noopener noreferrer" data-i18n-pt="${t.details}" data-i18n-en="${i18n.en.details}">${t.details}</a>`
      : `<span class="link-cta link-cta--disabled" title="${t.comingSoon}" aria-label="${t.comingSoon}" data-i18n-pt="${t.comingSoon}" data-i18n-en="${i18n.en.comingSoon}">${t.comingSoon}</span>`;

    const titleHTML = hasLink
      ? `<a class="event-row__title" href="${event.link}" target="_blank" rel="noopener noreferrer">${event.name}</a>`
      : `<span class="event-row__title">${event.name}</span>`;

    return `
      <div class="event-row ${statusClass} ${typeClass}">
        <div class="event-row__main">
          ${titleHTML}
          <span class="badge badge--type">${typeLabel}</span>
        </div>
        <div class="event-row__meta">
          <span class="meta">
            ${icons.calendar}
            ${dateHTML}
          </span>
          ${languagesHTML ? `<span class="meta">${icons.globe}${languagesHTML}</span>` : ''}
        </div>
        <div class="event-row__cta">
          ${ctaHTML}
        </div>
      </div>
    `;
  }


  /**
   * Create skeleton row
   */
  function createSkeletonRow() {
    return `
      <div class="event-row skeleton">
        <div class="event-row__main skeleton-shimmer"></div>
        <div class="event-row__meta skeleton-shimmer"></div>
        <div class="event-row__cta skeleton-shimmer"></div>
      </div>
    `;
  }

  /**
   * Group events by year/month
   */
  function groupByYearMonth(events) {
    const groups = {};
    events.forEach(event => {
      if (!event.dateISO) return;
      const date = new Date(event.dateISO);
      const year = date.getFullYear();
      const month = date.toLocaleString('en-US', { month: 'short' });
      const key = `${year} / ${month}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(event);
    });
    return groups;
  }

  /**
   * Fetch events from JSON
   */
  async function fetchEvents() {
    try {
      const response = await fetch(CONFIG.EVENTS_JSON_PATH, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return Array.isArray(data) ? data.map(formatEvent) : [];
    } catch (error) {
      console.error('Error fetching events:', error);
      return [];
    }
  }

  /**
   * Render home events section
   */
  async function renderHomeEvents() {
    const lang = getCurrentLang();
    const t = i18n[lang];
    const eventsContainer = document.querySelector('#events .events__list') || document.querySelector('#events');

    if (!eventsContainer) return;

    // Find or create event-list container
    let listContainer = eventsContainer.querySelector('.event-list');
    if (!listContainer) {
      listContainer = document.createElement('div');
      listContainer.className = 'event-list';
      // Insert before the CTA button if it exists
      const ctaContainer = eventsContainer.querySelector('.events__cta');
      if (ctaContainer) {
        eventsContainer.insertBefore(listContainer, ctaContainer);
      } else {
        eventsContainer.appendChild(listContainer);
      }
    }

    // Show skeletons while loading
    listContainer.innerHTML = createSkeletonRow() + createSkeletonRow() + createSkeletonRow();

    const events = await fetchEvents();
    const upcoming = events
      .filter(e => e.status === 'Upcoming')
      .sort((a, b) => new Date(a.dateISO) - new Date(b.dateISO));

    listContainer.innerHTML = '';

    if (upcoming.length === 0) {
      listContainer.innerHTML = `<p class="events__empty" data-i18n-pt="${t.noUpcoming}" data-i18n-en="${i18n.en.noUpcoming}">${t.noUpcoming}</p>`;
      updateI18n();
      return;
    }

    // Show up to MAX_HOME_EVENTS
    const homeEvents = upcoming.slice(0, CONFIG.MAX_HOME_EVENTS);
    homeEvents.forEach(event => {
      const rowHTML = createEventRow(event, lang);
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = rowHTML;
      listContainer.appendChild(tempDiv.firstElementChild);
    });

    updateI18n();
  }

  /**
   * Inject Event JSON-LD into document head
   */
  function injectEventJsonLd(events) {
    if (!Array.isArray(events) || !events.length) return;
    
    const mapped = events.map(ev => ({
      "@context": "https://schema.org",
      "@type": "Event",
      "name": ev.name,
      "eventStatus": "https://schema.org/EventScheduled",
      "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
      "startDate": ev.dateISO || ev.date || "",
      "location": {
        "@type": "Place",
        "name": "Coimbra",
        "address": {
          "@type": "PostalAddress",
          "addressLocality": "Coimbra",
          "addressCountry": "PT"
        }
      },
      "organizer": {
        "@type": "Organization",
        "name": "Coimbra Tech Afterhours",
        "url": "https://coimbratech.org"
      },
      "inLanguage": ["pt-PT", "en"],
      "url": "https://coimbratech.org/events",
      "isAccessibleForFree": true
    }));

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(mapped);
    document.head.appendChild(script);
  }

  /**
   * Render events page
   */
  async function renderEventsPage() {
    const lang = getCurrentLang();
    const t = i18n[lang];
    const upcomingSection = document.querySelector('.events-upcoming');
    const pastSection = document.querySelector('.events-past');

    if (!upcomingSection || !pastSection) return;

    // Find or create event-list containers
    let upcomingContainer = upcomingSection.querySelector('.event-list');
    if (!upcomingContainer) {
      upcomingContainer = document.createElement('div');
      upcomingContainer.className = 'event-list';
      const gridContainer = upcomingSection.querySelector('.grid--events');
      if (gridContainer) {
        gridContainer.replaceWith(upcomingContainer);
      } else {
        upcomingSection.appendChild(upcomingContainer);
      }
    }

    const pastContainer = pastSection.querySelector('.archive');

    // Show skeletons while loading
    upcomingContainer.innerHTML = createSkeletonRow() + createSkeletonRow();

    const events = await fetchEvents();
    const upcoming = events
      .filter(e => e.status === 'Upcoming')
      .sort((a, b) => new Date(a.dateISO) - new Date(b.dateISO));
    const past = events
      .filter(e => e.status === 'Past')
      .sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO));

    // Render upcoming
    upcomingContainer.innerHTML = '';
    if (upcoming.length === 0) {
      upcomingContainer.innerHTML = `<p class="events__empty" data-i18n-pt="${t.noUpcoming}" data-i18n-en="${i18n.en.noUpcoming}">${t.noUpcoming}</p>`;
    } else {
      upcoming.forEach(event => {
        const rowHTML = createEventRow(event, lang);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = rowHTML;
        upcomingContainer.appendChild(tempDiv.firstElementChild);
      });
    }

    // Render past
    if (pastContainer) {
      pastContainer.innerHTML = '';
      if (past.length === 0) {
        pastContainer.innerHTML = `<p class="events__empty" data-i18n-pt="${t.noPast}" data-i18n-en="${i18n.en.noPast}">${t.noPast}</p>`;
      } else {
        const groups = groupByYearMonth(past);
        // Sort month groups: newest first (reverse chronological)
        Object.keys(groups).sort().reverse().forEach(groupKey => {
          const groupDiv = document.createElement('div');
          groupDiv.className = 'archive__group';
          const groupTitle = document.createElement('h3');
          groupTitle.className = 'archive__group-title';
          groupTitle.textContent = groupKey;
          groupDiv.appendChild(groupTitle);

          const groupList = document.createElement('div');
          groupList.className = 'event-list';
          groups[groupKey].forEach(event => {
            const rowHTML = createEventRow(event, lang);
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = rowHTML;
            groupList.appendChild(tempDiv.firstElementChild);
          });
          groupDiv.appendChild(groupList);
          pastContainer.appendChild(groupDiv);
        });
      }
    }

    // Add organizer CTA after past events
    const organizerCTAContainer = document.querySelector('.events__organizer-cta');
    if (organizerCTAContainer) {
      organizerCTAContainer.style.display = 'block';
      organizerCTAContainer.innerHTML = `
        <h3 data-i18n-pt="${t.organizerCTA}" data-i18n-en="${i18n.en.organizerCTA}">${t.organizerCTA}</h3>
        <p data-i18n-pt="${t.organizerCTAText}" data-i18n-en="${i18n.en.organizerCTAText}">${t.organizerCTAText}</p>
        <a href="/#contact" class="cta-button" data-i18n-pt="${t.organizerCTAButton}" data-i18n-en="${i18n.en.organizerCTAButton}">${t.organizerCTAButton}</a>
      `;
    }

    updateI18n();
    
    // Inject Event JSON-LD
    injectEventJsonLd(events);
  }

  // Initialize i18n on load
  updateI18n();

  // Hook into existing language switcher
  const originalSwitchLang = window.switchLang;
  if (typeof originalSwitchLang === 'function') {
    window.switchLang = function(lang) {
      originalSwitchLang(lang);
      updateI18n();
      // Re-render if containers exist
      if (document.querySelector('#events')) {
        renderHomeEvents();
      }
      if (document.querySelector('.events-upcoming')) {
        renderEventsPage();
      }
    };
  }

  // Export functions
  window.renderHomeEvents = renderHomeEvents;
  window.renderEventsPage = renderEventsPage;

  // Auto-initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      if (document.querySelector('#events')) {
        renderHomeEvents();
      }
      if (document.querySelector('.events-upcoming')) {
        renderEventsPage();
      }
    });
  } else {
    if (document.querySelector('#events')) {
      renderHomeEvents();
    }
    if (document.querySelector('.events-upcoming')) {
      renderEventsPage();
    }
  }
})();
