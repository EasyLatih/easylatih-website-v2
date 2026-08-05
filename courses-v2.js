const COURSES_API_URL =
  "https://script.google.com/macros/s/AKfycbwp9TPceQ4TllKPJUPzmTt_COiNTnzeYmj8bx559HV57dybksFXQe9O0FSX_Eo9VZ8/exec";

let publishedCourses = [];

const coursesContainer = document.getElementById("coursesContainer");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const levelFilter = document.getElementById("levelFilter");
const noResultsMessage = document.getElementById("noResultsMessage");

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function loadPublishedCourses() {
  coursesContainer.innerHTML = "<p>Loading course catalogue...</p>";

  const callbackName =
    "publishedCoursesCallback_" + Date.now();

  const script = document.createElement("script");

  window[callbackName] = function (data) {
    publishedCourses = Array.isArray(data) ? data : [];

    populateCategoryFilter();
    renderCourses();

    delete window[callbackName];
    script.remove();
  };

  script.onerror = function () {
    coursesContainer.innerHTML =
      "<p>Unable to load the course catalogue.</p>";

    delete window[callbackName];
    script.remove();
  };

  script.src =
    COURSES_API_URL +
    "?action=getPublishedCourses&callback=" +
    encodeURIComponent(callbackName);

  document.body.appendChild(script);
}

function populateCategoryFilter() {
  const categories = [
    ...new Set(
      publishedCourses
        .map(course => course.category)
        .filter(Boolean)
    )
  ].sort();

  categoryFilter.innerHTML =
    '<option value="">All Categories</option>';

  categories.forEach(category => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categoryFilter.appendChild(option);
  });
}

function getFilteredCourses() {
  const searchValue =
    String(searchInput.value || "").trim().toLowerCase();

  const selectedCategory = categoryFilter.value;

  return publishedCourses.filter(course => {
    const searchableText = [
      course.courseTitle,
      course.category,
      course.courseOverview,
      course.bigWhy,
      course.learningOutcomes,
      course.courseContent
    ]
      .join(" ")
      .toLowerCase();

    if (
      selectedCategory &&
      course.category !== selectedCategory
    ) {
      return false;
    }

    if (
      searchValue &&
      !searchableText.includes(searchValue)
    ) {
      return false;
    }

    return true;
  });
}

function renderCourses() {
  const courses = getFilteredCourses();

  coursesContainer.innerHTML = "";

  if (courses.length === 0) {
    noResultsMessage.style.display = "block";
    return;
  }

  noResultsMessage.style.display = "none";

  courses.forEach(course => {
    const card = document.createElement("article");
    card.className = "course-card";

    const hrdBadge = course.isHRDClaimable
      ? "<span>HRD Corp Claimable</span>"
      : "";

    card.innerHTML = `
      <h3>${escapeHtml(course.courseTitle)}</h3>

      <p class="course-summary">
  ${escapeHtml(
    truncateText(course.courseOverview, 130)
  )}
</p>

      <div class="course-meta">
        ${
          course.category
            ? `<span>${escapeHtml(course.category)}</span>`
            : ""
        }

        ${
          course.duration
            ? `<span>${escapeHtml(course.duration)}</span>`
            : ""
        }

        ${
          course.deliveryMode
            ? `<span>${escapeHtml(course.deliveryMode)}</span>`
            : ""
        }

        ${hrdBadge}
      </div>

      ${
        course.bigWhy
          ? `
            <p class="details">
              <strong>Why this course?</strong><br>
              ${escapeHtml(course.bigWhy)}
            </p>
          `
          : ""
      }

      <a
        class="inquire-button"
        href="https://wa.me/60109202811?text=${encodeURIComponent(
          "Hi EasyLatih, I would like to enquire about the in-house course: " +
          course.courseTitle +
          " (" +
          course.masterCourseId +
          ")"
        )}"
        target="_blank"
        rel="noopener noreferrer"
        style="display:inline-block;text-decoration:none;"
      >
        Enquire About This Course
      </a>
    `;

    coursesContainer.appendChild(card);
  });
}

searchInput.addEventListener("input", renderCourses);
categoryFilter.addEventListener("change", renderCourses);

/*
  Level is not included in the current Courses sheet.
  Hide this filter temporarily to prevent confusion.
*/
if (levelFilter) {
  levelFilter.style.display = "none";
}

/*
  Existing HTML still contains an inquiry-cart button.
  Hide it during the first dynamic catalogue test.
*/
const inquiryCart = document.getElementById("inquiryCart");

if (inquiryCart) {
  inquiryCart.style.display = "none";
}

loadPublishedCourses();

function truncateText(text, maxLength = 130) {
  const cleanText = String(text || "").trim();

  if (!cleanText) {
    return "Course details are available upon enquiry.";
  }

  if (cleanText.length <= maxLength) {
    return cleanText;
  }

  return cleanText.substring(0, maxLength).trim() + "...";
}
