-- BLOCK select_semesters
SELECT
    *
FROM
    semesters;

-- BLOCK insert_semester
INSERT INTO
    semesters (semester)
VALUES
    (:semester);
