// State Management
let selectedFiles = [];
let rankedResults = [];
let coefficientsChart = null;

// DOM Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const fileListContainer = document.getElementById('fileListContainer');
const fileCount = document.getElementById('fileCount');
const jobForm = document.getElementById('jobRequirementsForm');
const analyzeBtn = document.getElementById('analyzeBtn');

// Navigation Tabs
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

// State Elements
const emptyState = document.getElementById('emptyState');
const loadingState = document.getElementById('loadingState');
const resultsDashboard = document.getElementById('resultsDashboard');
const candidatesList = document.getElementById('candidatesList');
const sortBySelect = document.getElementById('sortBySelect');

// Summary Cards
const statTotalResumes = document.getElementById('statTotalResumes');
const statShortlisted = document.getElementById('statShortlisted');
const statAvgScore = document.getElementById('statAvgScore');

// Model Stats Elements
const metricAccuracy = document.getElementById('metricAccuracy');
const metricPrecision = document.getElementById('metricPrecision');
const metricRecall = document.getElementById('metricRecall');
const metricAUC = document.getElementById('metricAUC');
const metricSamples = document.getElementById('metricSamples');
const weightsBreakdown = document.getElementById('weightsBreakdown');
const retrainBtn = document.getElementById('retrainBtn');

// Drawer / Modal Elements
const detailDrawer = document.getElementById('detailDrawer');
const drawerClose = document.getElementById('drawerClose');
const drawerBody = document.getElementById('drawerBody');

// Toast Container
const toastContainer = document.getElementById('toastContainer');

// Page Load Initializations
document.addEventListener('DOMContentLoaded', () => {
    // Fetch ML statistics initially
    fetchModelStats();
    
    // Setup file listeners
    setupDragAndDrop();
    
    // Setup tabs
    setupTabs();
    
    // Form submission
    jobForm.addEventListener('submit', handleFormSubmit);
    
    // Sorting listener
    sortBySelect.addEventListener('change', handleSortChange);
    
    // Drawer closer
    drawerClose.addEventListener('click', closeDrawer);
    detailDrawer.addEventListener('click', (e) => {
        if (e.target === detailDrawer) closeDrawer();
    });
    
    // Retrain button
    retrainBtn.addEventListener('click', handleRetrainModel);
});

// Toast Notifications Helper
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconClass = 'fa-info-circle';
    if (type === 'success') iconClass = 'fa-circle-check';
    if (type === 'danger') iconClass = 'fa-circle-xmark';
    
    toast.innerHTML = `<i class="fa-solid ${iconClass}"></i> <span>${message}</span>`;
    toastContainer.appendChild(toast);
    
    // Auto remove toast after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Navigation Tabs Logic
function setupTabs() {
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            
            tabButtons.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
        });
    });
}

// Drag & Drop Functionality
function setupDragAndDrop() {
    // Click dropzone to open input
    dropzone.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', (e) => {
        handleFilesSelected(e.target.files);
    });
    
    // Drag and drop states
    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('dragover');
        }, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('dragover');
        }, false);
    });
    
    dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        handleFilesSelected(dt.files);
    });
}

function handleFilesSelected(filesList) {
    for (let i = 0; i < filesList.length; i++) {
        const file = filesList[i];
        
        // Validation check
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['pdf', 'docx', 'txt'].includes(ext)) {
            showToast(`Unsupported format: ${file.name}`, 'danger');
            continue;
        }
        
        if (file.size > 10 * 1024 * 1024) { // 10MB limit
            showToast(`File too large: ${file.name} (Max 10MB)`, 'danger');
            continue;
        }
        
        // Avoid duplicates
        if (!selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
            selectedFiles.push(file);
        }
    }
    
    updateFileUI();
}

function removeFile(index) {
    selectedFiles.splice(index, 1);
    updateFileUI();
}

function updateFileUI() {
    fileList.innerHTML = '';
    
    if (selectedFiles.length === 0) {
        fileListContainer.classList.add('hidden');
        return;
    }
    
    fileListContainer.classList.remove('hidden');
    fileCount.textContent = selectedFiles.length;
    
    selectedFiles.forEach((file, index) => {
        const ext = file.name.split('.').pop().toLowerCase();
        let fileIcon = 'fa-file-lines';
        if (ext === 'pdf') fileIcon = 'fa-file-pdf';
        if (ext === 'docx') fileIcon = 'fa-file-word';
        
        const li = document.createElement('li');
        li.className = 'file-item';
        li.innerHTML = `
            <div class="file-item-info">
                <i class="fa-solid ${fileIcon}"></i>
                <span class="file-item-name" title="${file.name}">${file.name}</span>
            </div>
            <button class="file-remove-btn" onclick="removeFile(${index})">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        `;
        fileList.appendChild(li);
    });
}

// Form Submission & Analysis API Integration
async function handleFormSubmit(e) {
    e.preventDefault();
    
    if (selectedFiles.length === 0) {
        showToast('Please upload at least one resume.', 'danger');
        return;
    }
    
    const jd = document.getElementById('jobDescription').value.strip ? document.getElementById('jobDescription').value.strip() : document.getElementById('jobDescription').value;
    if (!jd) {
        showToast('Please provide a job description.', 'danger');
        return;
    }
    
    // Start loading state
    setLoadingState(true);
    
    const formData = new FormData();
    formData.append('job_description', jd);
    formData.append('min_experience', parseFloat(document.getElementById('minExperience').value) || 0.0);
    formData.append('required_skills', document.getElementById('requiredSkills').value);
    formData.append('required_education', document.getElementById('requiredEducation').value);
    
    selectedFiles.forEach(file => {
        formData.append('resumes', file);
    });
    
    try {
        const response = await fetch('/api/rank', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Failed to screen resumes.');
        }
        
        const data = await response.json();
        rankedResults = data.rankings;
        
        // Render results
        displayResults(data);
        showToast(`Successfully screened ${selectedFiles.length} resumes!`, 'success');
    } catch (error) {
        console.error(error);
        showToast(error.message || 'Error occurred during processing.', 'danger');
        setLoadingState(false);
    }
}

function setLoadingState(isLoading) {
    if (isLoading) {
        emptyState.classList.add('hidden');
        resultsDashboard.classList.add('hidden');
        loadingState.classList.remove('hidden');
        
        // Disable buttons
        analyzeBtn.disabled = true;
        analyzeBtn.querySelector('.btn-text').classList.add('hidden');
        analyzeBtn.querySelector('.btn-loader').classList.remove('hidden');
    } else {
        loadingState.classList.add('hidden');
        analyzeBtn.disabled = false;
        analyzeBtn.querySelector('.btn-text').classList.remove('hidden');
        analyzeBtn.querySelector('.btn-loader').classList.add('hidden');
    }
}

// Render rankings dashboard
function displayResults(data) {
    setLoadingState(false);
    resultsDashboard.classList.remove('hidden');
    
    // Update summary metrics
    const rankings = data.rankings;
    statTotalResumes.textContent = rankings.length;
    
    const shortlistedCount = rankings.filter(r => r.shortlist_predicted === 1).length;
    statShortlisted.textContent = shortlistedCount;
    
    const sumSimilarity = rankings.reduce((acc, curr) => acc + curr.cosine_similarity, 0);
    const avgSimilarity = rankings.length > 0 ? (sumSimilarity / rankings.length) * 100 : 0;
    statAvgScore.textContent = `${avgSimilarity.toFixed(0)}%`;
    
    // Reset sort select to default probability
    sortBySelect.value = 'probability';
    
    // Render list
    renderCandidates(rankings);
}

function renderCandidates(candidates) {
    candidatesList.innerHTML = '';
    
    if (candidates.length === 0) {
        candidatesList.innerHTML = '<div class="empty-state">No candidates returned.</div>';
        return;
    }
    
    candidates.forEach((candidate, index) => {
        const probPct = (candidate.shortlist_probability * 100).toFixed(0);
        const simPct = (candidate.cosine_similarity * 100).toFixed(0);
        
        // Define probability levels
        let probClass = 'low';
        let probLabel = 'Unlikely';
        if (candidate.shortlist_probability >= 0.7) {
            probClass = 'high';
            probLabel = 'Highly Recommended';
        } else if (candidate.shortlist_probability >= 0.45) {
            probClass = 'medium';
            probLabel = 'Potential Match';
        }
        
        const card = document.createElement('div');
        card.className = 'candidate-card';
        card.addEventListener('click', () => openCandidateDetail(candidate));
        
        // Generate skills chips preview (first 4 skills)
        const matchChips = candidate.skills_matched.slice(0, 3).map(s => 
            `<span class="tag-skill-match">${s}</span>`
        ).join('');
        const missingChips = candidate.skills_missing.slice(0, 2).map(s => 
            `<span class="tag-skill-missing">${s}</span>`
        ).join('');
        
        card.innerHTML = `
            <div class="rank-badge">${index + 1}</div>
            <div class="candidate-info">
                <h4>${candidate.filename}</h4>
                <div class="candidate-meta">
                    <span><i class="fa-solid fa-hourglass-half"></i> ${candidate.experience_years.toFixed(1)} yrs</span>
                    <span><i class="fa-solid fa-graduation-cap"></i> ${candidate.education_level}</span>
                </div>
                <div class="skills-preview">
                    ${matchChips}
                    ${missingChips}
                    ${(candidate.skills_matched.length > 3 || candidate.skills_missing.length > 2) ? '<span class="text-muted" style="font-size: 0.7rem;">+more</span>' : ''}
                </div>
            </div>
            <div class="candidate-scores">
                <span class="prediction-tag ${probClass}">
                    <i class="fa-solid fa-percent"></i> ${probPct}% shortlist prob
                </span>
                <span class="similarity-score">
                    TF-IDF: ${simPct}%
                    <div class="similarity-bar-container">
                        <div class="similarity-bar" style="width: ${simPct}%"></div>
                    </div>
                </span>
            </div>
        `;
        
        candidatesList.appendChild(card);
    });
}

// Sorting handler
function handleSortChange() {
    const sortBy = sortBySelect.value;
    
    if (sortBy === 'probability') {
        rankedResults.sort((a, b) => b.shortlist_probability - a.shortlist_probability);
    } else if (sortBy === 'similarity') {
        rankedResults.sort((a, b) => b.cosine_similarity - a.cosine_similarity);
    } else if (sortBy === 'experience') {
        rankedResults.sort((a, b) => b.experience_years - a.experience_years);
    }
    
    renderCandidates(rankedResults);
}

// Candidate Details Drawer
function openCandidateDetail(candidate) {
    const probPct = (candidate.shortlist_probability * 100).toFixed(0);
    const simPct = (candidate.cosine_similarity * 100).toFixed(0);
    
    let probClass = 'low';
    let probLabel = 'Unlikely';
    if (candidate.shortlist_probability >= 0.7) {
        probClass = 'high';
        probLabel = 'Highly Recommended';
    } else if (candidate.shortlist_probability >= 0.45) {
        probClass = 'medium';
        probLabel = 'Potential Match';
    }
    
    // Skills formatting
    const matchedSkillsHtml = candidate.skills_matched.length > 0 
        ? candidate.skills_matched.map(s => `<span class="tag-skill-match" style="padding: 0.35rem 0.6rem; margin: 0.15rem; font-size: 0.75rem;">${s}</span>`).join('')
        : '<p class="text-muted" style="font-size: 0.8rem;">No matched skills</p>';
        
    const missingSkillsHtml = candidate.skills_missing.length > 0 
        ? candidate.skills_missing.map(s => `<span class="tag-skill-missing" style="padding: 0.35rem 0.6rem; margin: 0.15rem; font-size: 0.75rem;">${s}</span>`).join('')
        : '<p class="text-muted" style="font-size: 0.8rem;">No missing skills</p>';
        
    const allSkillsFoundHtml = candidate.skills_found.length > 0
        ? candidate.skills_found.map(s => `<span class="btn-secondary" style="font-size: 0.75rem; border-radius: 4px; padding: 0.25rem 0.5rem; background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.05);">${s}</span>`).join(' ')
        : '<p class="text-muted" style="font-size: 0.8rem;">None detected</p>';

    drawerBody.innerHTML = `
        <div class="candidate-detail-header">
            <h2>${candidate.filename}</h2>
            <div class="candidate-scores" style="align-items: flex-start; text-align: left; margin-top: 0.5rem;">
                <span class="prediction-tag ${probClass}" style="font-size: 0.85rem; padding: 0.35rem 0.75rem;">
                    <strong>${probLabel} (${probPct}%)</strong>
                </span>
            </div>
            
            <div class="candidate-detail-stats">
                <div class="detail-stat-box">
                    <span class="val">${simPct}%</span>
                    <span class="lbl">TF-IDF Match</span>
                </div>
                <div class="detail-stat-box">
                    <span class="val">${candidate.experience_years.toFixed(1)} yrs</span>
                    <span class="lbl">Experience</span>
                </div>
                <div class="detail-stat-box">
                    <span class="val">${candidate.education_level}</span>
                    <span class="lbl">Education</span>
                </div>
            </div>
        </div>
        
        <div class="detail-section-title">Job Requirements Alignment</div>
        <div class="skills-detail-grid">
            <div class="skills-detail-list">
                <h4><i class="fa-solid fa-circle-check" style="color: var(--success);"></i> Matched Skills</h4>
                <div style="display: flex; flex-wrap: wrap;">${matchedSkillsHtml}</div>
            </div>
            <div class="skills-detail-list">
                <h4><i class="fa-solid fa-circle-xmark" style="color: var(--danger);"></i> Missing Skills</h4>
                <div style="display: flex; flex-wrap: wrap;">${missingSkillsHtml}</div>
            </div>
        </div>
        
        <div class="detail-section-title">All Detected Skills</div>
        <div style="display: flex; flex-wrap: wrap; gap: 0.35rem;">
            ${allSkillsFoundHtml}
        </div>
        
        <div class="detail-section-title">Resume Content Preview</div>
        <div class="resume-preview-box">
            ${candidate.text_preview}
        </div>
    `;
    
    detailDrawer.classList.add('open');
}

function closeDrawer() {
    detailDrawer.classList.remove('open');
}

// Fetch ML Model Statistics & Render Chart
async function fetchModelStats() {
    try {
        const response = await fetch('/api/model-stats');
        if (!response.ok) throw new Error('Failed to fetch model statistics');
        const stats = await response.json();
        
        // Update performance cards
        metricAccuracy.textContent = `${(stats.accuracy * 100).toFixed(0)}%`;
        metricPrecision.textContent = `${(stats.precision * 100).toFixed(0)}%`;
        metricRecall.textContent = `${(stats.recall * 100).toFixed(0)}%`;
        metricAUC.textContent = stats.auc.toFixed(2);
        metricSamples.textContent = stats.samples_count;
        
        // Render coefficient breakdown
        renderCoefficients(stats.coefficients);
    } catch (error) {
        console.error(error);
        showToast('Error loading classifier statistics.', 'danger');
    }
}

function renderCoefficients(coefficients) {
    // Render Weight List
    weightsBreakdown.innerHTML = '';
    
    const sortedFeatures = Object.entries(coefficients).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    
    sortedFeatures.forEach(([name, val]) => {
        const signClass = val >= 0 ? 'positive' : 'negative';
        const plusSign = val >= 0 ? '+' : '';
        const humanName = name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        
        const li = document.createElement('li');
        li.className = 'weight-row';
        li.innerHTML = `
            <span class="weight-name">${humanName}</span>
            <span class="weight-val ${signClass}">${plusSign}${val.toFixed(2)}</span>
        `;
        weightsBreakdown.appendChild(li);
    });
    
    // Draw/Update Chart.js Bar Chart
    const labels = sortedFeatures.map(f => f[0].replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
    const values = sortedFeatures.map(f => f[1]);
    const bgColors = values.map(v => v >= 0 ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)');
    const borderColors = values.map(v => v >= 0 ? 'rgba(16, 185, 129, 1)' : 'rgba(239, 68, 68, 1)');
    
    if (coefficientsChart) {
        coefficientsChart.destroy();
    }
    
    const ctx = document.getElementById('coefficientsChart').getContext('2d');
    coefficientsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Coefficient (Feature Weight)',
                data: values,
                backgroundColor: bgColors,
                borderColor: borderColors,
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y', // Horizontal bars
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Weight: ${context.parsed.x.toFixed(3)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: '#9ca3af'
                    }
                },
                y: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#f3f4f6',
                        font: {
                            family: 'Outfit'
                        }
                    }
                }
            }
        }
    });
}

// Retrain model handler
async function handleRetrainModel() {
    retrainBtn.disabled = true;
    retrainBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Training...';
    
    try {
        const response = await fetch('/api/train', { method: 'POST' });
        if (!response.ok) throw new Error('Retraining failed');
        
        const data = await response.json();
        
        // Update stats
        const stats = data.stats;
        metricAccuracy.textContent = `${(stats.accuracy * 100).toFixed(0)}%`;
        metricPrecision.textContent = `${(stats.precision * 100).toFixed(0)}%`;
        metricRecall.textContent = `${(stats.recall * 100).toFixed(0)}%`;
        metricAUC.textContent = stats.auc.toFixed(2);
        metricSamples.textContent = stats.samples_count;
        
        renderCoefficients(stats.coefficients);
        
        showToast('Logistic Regression model retrained successfully!', 'success');
    } catch (error) {
        console.error(error);
        showToast('Failed to retrain model.', 'danger');
    } finally {
        retrainBtn.disabled = false;
        retrainBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Retrain Model';
    }
}
