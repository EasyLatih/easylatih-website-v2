const COURSES_API_URL =
  "https://script.google.com/macros/s/AKfycbwp9TPceQ4TllKPJUPzmTt_COiNTnzeYmj8bx559HV57dybksFXQe9O0FSX_Eo9VZ8/exec";

const COURSE_ENQUIRY_URL =
  "https://script.google.com/macros/s/AKfycbw1PRE_G3xUUc9WEAOX6m2bAAJ4yvtY3ghMihC4dxGVfsT6JwPjIyJl_VhPdihGA3c/exec";

let publishedCourses = [];

const coursesContainer =
  document.getElementById("coursesContainer");

const searchInput =
  document.getElementById("searchInput");

const categoryFilter =
  document.getElementById("categoryFilter");

const levelFilter =
  document.getElementById("levelFilter");

const noResultsMessage =
  document.getElementById("noResultsMessage");


function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function loadPublishedCourses() {
  coursesContainer.innerHTML =
    "<p>Loading course catalogue...</p>";

  const callbackName =
    "publishedCoursesCallback_" + Date.now();

  const script =
    document.createElement("script");

  window[callbackName] = function (data) {
    publishedCourses =
      Array.isArray(data) ? data : [];

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
        .map(function (course) {
          return course.category;
        })
        .filter(Boolean)
    )
  ].sort();

  categoryFilter.innerHTML =
    '<option value="">All Categories</option>';

  categories.forEach(function (category) {
    const option =
      document.createElement("option");

    option.value = category;
    option.textContent = category;

    categoryFilter.appendChild(option);
  });
}


function getCourseSummary(course) {
  return String(
    course.publicCourseSummary ||
    course.courseOverview ||
    course.shortCourseOverview ||
    ""
  ).trim();
}


function getCourseOverview(course) {
  return String(
    course.shortCourseOverview ||
    course.courseOverview ||
    ""
  ).trim();
}


function getLearningOutcomes(course) {
  const outcomes = [
    course.learningOutcome1,
    course.learningOutcome2,
    course.learningOutcome3
  ]
    .map(function (value) {
      return String(value || "").trim();
    })
    .filter(Boolean);

  if (outcomes.length > 0) {
    return outcomes;
  }

  return splitLegacyText(
    course.learningOutcomes || ""
  );
}


function getKeyTopics(course) {
  const topics = [
    course.keyTopic1,
    course.keyTopic2,
    course.keyTopic3,
    course.keyTopic4
  ]
    .map(function (value) {
      return String(value || "").trim();
    })
    .filter(Boolean);

  if (topics.length > 0) {
    return topics;
  }

  return splitLegacyText(
    course.courseContent || ""
  );
}


function splitLegacyText(value) {
  const text =
    String(value || "").trim();

  if (!text) {
    return [];
  }

  const lines = text
    .split(/\r?\n/)
    .map(function (line) {
      return line
        .replace(/^[\s•\-–—\d.)]+/, "")
        .trim();
    })
    .filter(Boolean);

  return lines.length > 0
    ? lines
    : [text];
}


function getFilteredCourses() {
  const searchValue =
    String(searchInput.value || "")
      .trim()
      .toLowerCase();

  const selectedCategory =
    categoryFilter.value;

  return publishedCourses.filter(
    function (course) {
      const searchableText = [
        course.courseTitle,
        course.category,
        getCourseSummary(course),
        getCourseOverview(course),
        getLearningOutcomes(course).join(" "),
        getKeyTopics(course).join(" ")
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
    }
  );
}


function renderCourses() {
  const courses =
    getFilteredCourses();

  coursesContainer.innerHTML = "";

  if (courses.length === 0) {
    noResultsMessage.style.display =
      "block";

    return;
  }

  noResultsMessage.style.display =
    "none";

  courses.forEach(function (course) {
    const card =
      document.createElement("article");

    card.className =
      "course-card";

    const courseSummary =
      getCourseSummary(course);

    const courseOverview =
      getCourseOverview(course);

    const learningOutcomes =
      getLearningOutcomes(course);

    const keyTopics =
      getKeyTopics(course);

    const hrdBadge =
      course.isHRDClaimable
        ? "<span>HRD Corp Claimable</span>"
        : "";

    card.innerHTML = `
      <h3>
        ${escapeHtml(course.courseTitle)}
      </h3>

      <p class="course-summary">
        ${escapeHtml(
          truncateText(courseSummary, 130)
        )}
      </p>

      <div class="course-meta">
        ${
          course.category
            ? `<span>${escapeHtml(
                course.category
              )}</span>`
            : ""
        }

        ${
          course.duration
            ? `<span>${escapeHtml(
                course.duration
              )}</span>`
            : ""
        }

        ${
          course.deliveryMode
            ? `<span>${escapeHtml(
                course.deliveryMode
              )}</span>`
            : ""
        }

        ${hrdBadge}
      </div>

      <button
        type="button"
        class="course-details-toggle"
        onclick="toggleCourseDetails(this)"
        aria-expanded="false"
      >
        View Course Details
      </button>

      <div class="course-expanded-details">

        ${
          courseOverview
            ? `
              <div class="course-detail-section">
                <h4>Short Course Overview</h4>

                <p>
                  ${formatMultiline(
                    courseOverview
                  )}
                </p>
              </div>
            `
            : ""
        }

        ${
          learningOutcomes.length > 0
            ? `
              <div class="course-detail-section">
                <h4>Key Learning Outcomes</h4>

                ${renderDetailList(
                  learningOutcomes
                )}
              </div>
            `
            : ""
        }

        ${
          keyTopics.length > 0
            ? `
              <div class="course-detail-section">
                <h4>Key Topics</h4>

                ${renderDetailList(
                  keyTopics
                )}
              </div>
            `
            : ""
        }

      </div>

      <a
        class="inquire-button"
        href="${escapeHtml(
          COURSE_ENQUIRY_URL +
          "?page=course-enquiry&course=" +
          encodeURIComponent(course.masterCourseId || "") +
          "&title=" +
          encodeURIComponent(course.courseTitle || "")
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


function renderDetailList(items) {
  return `
    <ul style="
      margin:0;
      padding-left:20px;
      color:#374151;
      font-size:14px;
      line-height:1.65;
    ">
      ${items
        .map(function (item) {
          return `
            <li style="
              margin-bottom:5px;
              overflow-wrap:anywhere;
              word-break:break-word;
            ">
              ${escapeHtml(item)}
            </li>
          `;
        })
        .join("")}
    </ul>
  `;
}


function formatMultiline(text) {
  return escapeHtml(text || "")
    .replace(/\r?\n/g, "<br>");
}


function toggleCourseDetails(button) {
  const details =
    button.nextElementSibling;

  if (
    !details ||
    !details.classList.contains(
      "course-expanded-details"
    )
  ) {
    return;
  }

  const isOpen =
    details.classList.toggle("open");

  button.textContent =
    isOpen
      ? "Hide Course Details"
      : "View Course Details";

  button.setAttribute(
    "aria-expanded",
    String(isOpen)
  );
}


function truncateText(
  text,
  maxLength = 130
) {
  const cleanText =
    String(text || "").trim();

  if (!cleanText) {
    return (
      "Course details are available upon enquiry."
    );
  }

  if (cleanText.length <= maxLength) {
    return cleanText;
  }

  return (
    cleanText
      .substring(0, maxLength)
      .trim() +
    "..."
  );
}


searchInput.addEventListener(
  "input",
  renderCourses
);

categoryFilter.addEventListener(
  "change",
  renderCourses
);


/*
  Level is not included in the current
  Courses sheet, so hide this filter.
*/
if (levelFilter) {
  levelFilter.style.display = "none";
}


/*
  Hide the old inquiry cart because each
  course now has its own enquiry form.
*/
const inquiryCart =
  document.getElementById("inquiryCart");

if (inquiryCart) {
  inquiryCart.style.display = "none";
}


loadPublishedCourses();
