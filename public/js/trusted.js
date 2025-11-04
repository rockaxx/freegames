// ===========================
// TRUSTED DOWNLOADS SYSTEM
// ===========================

// Configuration - Add your items here
const TRUSTED_ITEMS = [
  {
    name: "Internet Download Manager",
    folderName: "Internet Download Manager", // must match folder name in downloads/
    description: "The fastest download manager with resume capability and dynamic segmentation.",
    uploaded: "2025-01-15",
    crackedBy: "K-D-A Team",
    imageUrl: "https://www.internetdownloadmanager.com/register/IDMlib/images/idman_logos.png", // external URL
    // OR use local image:
    // localImage: "/assets/downloads/idm.jpg"
    // Leave imageUrl empty if using localImage
    files: [/*
      { name: "IDM_Setup.zip", size: "15.2 MB" },
      { name: "IDM_Setup.7z", size: "12.8 MB" }*/
    ]
  },
  {
    name: "NetLimiter",
    folderName: "NetLimiter",
    description: "Advanced network traffic control and monitoring tool.",
    uploaded: "2025-01-20",
    crackedBy: "K-D-A Team",
    imageUrl: "https://www.netlimiter.com/img/logo.png", // external URL
    //localImage: "/assets/downloads/netlimiter.jpg", // local image
    files: [
      { name: "netlimiter.7z", size: "8.2 MB" },
      { name: "netlimiter.zip", size: "8.6 MB" }
    ]
  },
  {
    name: "Internet Download Manager",
    folderName: "Internet Download Manager", // must match folder name in downloads/
    description: "The fastest download manager with resume capability and dynamic segmentation.",
    uploaded: "2025-01-15",
    crackedBy: "K-D-A Team",
    imageUrl: "https://www.internetdownloadmanager.com/images/idm_screenshot_6_35.png", // external URL
    // OR use local image:
    // localImage: "/assets/downloads/idm.jpg"
    // Leave imageUrl empty if using localImage
    files: [/*
      { name: "IDM_Setup.zip", size: "15.2 MB" },
      { name: "IDM_Setup.7z", size: "12.8 MB" }*/
    ]
  },
  {
    name: "Internet Download Manager",
    folderName: "Internet Download Manager", // must match folder name in downloads/
    description: "The fastest download manager with resume capability and dynamic segmentation.",
    uploaded: "2025-01-15",
    crackedBy: "K-D-A Team",
    imageUrl: "https://www.internetdownloadmanager.com/register/IDMlib/images/idman_logos.png", // external URL
    // OR use local image:
    // localImage: "/assets/downloads/idm.jpg"
    // Leave imageUrl empty if using localImage
    files: [/*
      { name: "IDM_Setup.zip", size: "15.2 MB" },
      { name: "IDM_Setup.7z", size: "12.8 MB" }*/
    ]
  }
];

// ===========================
// RENDERING LOGIC
// ===========================

function createDownloadCard(item) {
  const card = document.createElement('div');
  card.className = 'trusted-card';
  
  // Determine image source
  const imageSrc = item.localImage || item.imageUrl || '/assets/placeholder.jpg';
  
  // Create file download buttons
  const fileButtons = item.files.map(file => {
    const fileExt = file.name.split('.').pop().toUpperCase();
    const downloadPath = `/trusted_downloads/${encodeURIComponent(item.folderName)}/${encodeURIComponent(file.name)}`;
    
    return `
      <a href="${downloadPath}" download class="download-btn download-btn--${fileExt.toLowerCase()}">
        <span class="download-btn__icon">⬇</span>
        <span class="download-btn__text">.${fileExt}</span>
        <span class="download-btn__size">${file.size}</span>
      </a>
    `;
  }).join('');

  card.innerHTML = `
    <div class="trusted-card__image">
      <img src="${imageSrc}" alt="${item.name}" onerror="this.src='/assets/placeholder.jpg'">
    </div>
    <div class="trusted-card__content">
      <h3 class="trusted-card__title">${item.name}</h3>
      <p class="trusted-card__description">${item.description}</p>
      
      <div class="trusted-card__meta">
        <div class="meta-item">
          <span class="meta-label">📅 Uploaded:</span>
          <span class="meta-value">${item.uploaded}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">🔓 Cracked by:</span>
          <span class="meta-value">${item.crackedBy}</span>
        </div>
      </div>
      
      <div class="trusted-card__downloads">
        ${fileButtons}
      </div>
    </div>
  `;
  
  return card;
}

function renderTrustedItems() {
  const container = document.getElementById('trustedGrid');
  
  if (!container) {
    console.error('Container #trustedGrid not found!');
    return;
  }
  
  // Clear existing content
  container.innerHTML = '';
  
  // Render each item
  TRUSTED_ITEMS.forEach(item => {
    const card = createDownloadCard(item);
    container.appendChild(card);
  });
  
  console.log(`✅ Rendered ${TRUSTED_ITEMS.length} trusted items`);
}

// ===========================
// SEARCH & FILTER
// ===========================

function setupSearch() {
  const searchInput = document.getElementById('trustedSearch');
  
  if (!searchInput) return;
  
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const cards = document.querySelectorAll('.trusted-card');
    
    cards.forEach(card => {
      const title = card.querySelector('.trusted-card__title').textContent.toLowerCase();
      const description = card.querySelector('.trusted-card__description').textContent.toLowerCase();
      const crackedBy = card.querySelector('.meta-value:last-child').textContent.toLowerCase();
      
      const matches = title.includes(query) || 
                     description.includes(query) || 
                     crackedBy.includes(query);
      
      card.style.display = matches ? 'flex' : 'none';
    });
  });
}

// ===========================
// INITIALIZATION
// ===========================

document.addEventListener('DOMContentLoaded', () => {
  renderTrustedItems();
  setupSearch();
});
