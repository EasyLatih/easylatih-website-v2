(() => {
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};

  if (
    !cfg.supabaseUrl ||
    !cfg.supabasePublishableKey ||
    typeof publishedCourses === "undefined"
  ) {
    return;
  }

  async function loadTrainerProgrammes() {
    try {
      const response = await fetch(
        `${cfg.supabaseUrl}/rest/v1/public_programme_catalogue?select=*`,
        {
          headers: {
            apikey: cfg.supabasePublishableKey
          }
        }
      );

      if (!response.ok) {
        throw new Error(
          `Supabase catalogue ${response.status}`
        );
      }

      const rows = await response.json();

      /*
        Course Catalog has one source of truth:
        modules published from the Trainer Portal.
      */
      publishedCourses = (
        Array.isArray(rows) ? rows : []
      ).map(function (row) {
        return {
          masterCourseId: `trainer-${row.programme_id}`,
          courseTitle: row.course_title,
          category: row.category,
          duration: row.duration,
          deliveryMode: row.delivery_method,
          publicCourseSummary: row.programme_overview,
          shortCourseOverview: row.programme_overview,
          learningOutcomes: Array.isArray(
            row.learning_outcomes
          )
            ? row.learning_outcomes.join("\n")
            : "",
          courseContent: Array.isArray(
            row.modules
          )
            ? row.modules
                .map(function (module) {
                  return (
                    module?.title ||
                    module?.name ||
                    String(module)
                  );
                })
                .join("\n")
            : "",
          isHRDClaimable: false,
          source: "trainer-portal"
        };
      });

      populateCategoryFilter();
      renderCourses();
    } catch (error) {
      console.warn(
        "Trainer catalogue could not be loaded",
        error
      );

      if (typeof coursesContainer !== "undefined") {
        coursesContainer.innerHTML =
          "<p>Unable to load the course catalogue. Please try again shortly.</p>";
      }

      if (typeof noResultsMessage !== "undefined") {
        noResultsMessage.style.display = "none";
      }
    }
  }

  loadTrainerProgrammes();
})();
