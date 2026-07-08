document.addEventListener('DOMContentLoaded', () => {
  const uploadForm = document.getElementById('uploadForm');
  const dropZone = document.getElementById('dropZone');
  const photoFileInput = document.getElementById('photoFile');
  
  const dropzonePrompt = document.getElementById('dropzonePrompt');
  const dropzonePreview = document.getElementById('dropzonePreview');
  const imagePreview = document.getElementById('imagePreview');
  const previewFileName = document.getElementById('previewFileName');
  const previewFileSize = document.getElementById('previewFileSize');
  const removeFileBtn = document.getElementById('removeFileBtn');
  
  const uploadBtn = document.getElementById('uploadBtn');
  const btnText = uploadBtn.querySelector('.btn-text');
  const btnLoader = uploadBtn.querySelector('.btn-loader');
  
  const studentNameInput = document.getElementById('studentName');
  const registerNumberInput = document.getElementById('registerNumber');
  
  // Custom Error elements
  const nameError = document.getElementById('nameError');
  const regError = document.getElementById('regError');
  const fileError = document.getElementById('fileError');
  const submitErrorAlert = document.getElementById('submitErrorAlert');
  const submitErrorMessage = document.getElementById('submitErrorMessage');
  
  // Success Screen
  const successScreen = document.getElementById('successScreen');
  
  let selectedFile = null;
  const MAX_FILE_SIZE_BYTES = 40 * 1024; // 40 KB
  const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png'];
  const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];

  // Automatically capitalize register number input and trim symbols
  registerNumberInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  // Trigger file browser on dropzone click
  dropZone.addEventListener('click', (e) => {
    // Avoid double trigger if clicking the trash icon
    if (e.target.closest('#removeFileBtn')) return;
    photoFileInput.click();
  });

  // File drag & drop event handlers
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('dragover');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      handleFileSelection(files[0]);
    }
  });

  // Handle file input change
  photoFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  });

  // Remove selected file handler
  removeFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearSelectedFile();
  });

  // File validation and preview logic
  function handleFileSelection(file) {
    clearErrors();
    
    // Validate file type
    const fileExtension = file.name.split('.').pop().toLowerCase();
    const isValidType = ALLOWED_EXTENSIONS.includes(fileExtension) && ALLOWED_MIME_TYPES.includes(file.type);
    
    if (!isValidType) {
      showFileError('Only JPG, JPEG, and PNG images are allowed.');
      clearSelectedFile();
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      showFileError('Maximum image size is 40 KB.');
      clearSelectedFile();
      return;
    }

    // File is valid, setup preview
    selectedFile = file;
    previewFileName.textContent = file.name;
    previewFileSize.textContent = formatBytes(file.size);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      imagePreview.src = e.target.result;
      dropzonePrompt.classList.add('d-none');
      dropzonePreview.classList.remove('d-none');
      dropZone.style.borderStyle = 'solid';
    };
    reader.readAsDataURL(file);
  }

  function clearSelectedFile() {
    selectedFile = null;
    photoFileInput.value = '';
    imagePreview.src = '';
    previewFileName.textContent = '';
    previewFileSize.textContent = '';
    dropzonePrompt.classList.remove('d-none');
    dropzonePreview.classList.add('d-none');
    dropZone.style.borderStyle = 'dashed';
  }

  function showFileError(msg) {
    fileError.textContent = msg;
    fileError.classList.remove('d-none');
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = 1;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function clearErrors() {
    nameError.classList.add('d-none');
    regError.classList.add('d-none');
    fileError.classList.add('d-none');
    submitErrorAlert.classList.add('d-none');
  }

  // Handle Form Submission
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    let hasError = false;

    // Validate Student Name
    const nameVal = studentNameInput.value.trim();
    if (!nameVal) {
      nameError.classList.remove('d-none');
      hasError = true;
    }

    // Validate Register Number
    const regVal = registerNumberInput.value.trim();
    if (!regVal) {
      regError.classList.remove('d-none');
      hasError = true;
    }

    // Validate Photo File
    if (!selectedFile) {
      showFileError('Please select a passport size photo.');
      hasError = true;
    }

    if (hasError) return;

    // Form fields are valid, start submission
    setLoadingState(true);

    // Create FormData object and append values (text fields first, then file)
    const formData = new FormData();
    formData.append('studentName', nameVal);
    formData.append('registerNumber', regVal);
    formData.append('photo', selectedFile);

    try {
      const response = await fetch('/upload', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Show Success screen
        showSuccessState();
      } else {
        // Display Server validation errors
        showSubmitError(data.message || 'Failed to upload photo. Please check details and try again.');
        setLoadingState(false);
      }
    } catch (err) {
      console.error('Submission error:', err);
      showSubmitError('A connection error occurred. Make sure the server is online.');
      setLoadingState(false);
    }
  });

  function setLoadingState(isLoading) {
    if (isLoading) {
      uploadBtn.disabled = true;
      btnText.classList.add('d-none');
      btnLoader.classList.remove('d-none');
      
      studentNameInput.disabled = true;
      registerNumberInput.disabled = true;
      removeFileBtn.disabled = true;
    } else {
      uploadBtn.disabled = false;
      btnText.classList.remove('d-none');
      btnLoader.classList.add('d-none');
      
      studentNameInput.disabled = false;
      registerNumberInput.disabled = false;
      removeFileBtn.disabled = false;
    }
  }

  function showSubmitError(msg) {
    submitErrorMessage.textContent = msg;
    submitErrorAlert.classList.remove('d-none');
  }

  function showSuccessState() {
    // Hide Form, Show Success
    uploadForm.classList.add('d-none');
    successScreen.classList.remove('d-none');
    
    // Automatically reset and show the form after 4 seconds
    setTimeout(() => {
      // Fade out success screen and fade in form
      successScreen.classList.add('d-none');
      uploadForm.classList.remove('d-none');
      
      // Reset inputs & files
      studentNameInput.value = '';
      registerNumberInput.value = '';
      clearSelectedFile();
      setLoadingState(false);
      clearErrors();
    }, 4000);
  }
});
