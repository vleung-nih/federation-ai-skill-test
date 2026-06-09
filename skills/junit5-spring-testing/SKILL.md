---
name: junit5-spring-testing
description: help write, review, and improve unit and focused integration tests for java spring and spring boot applications using junit 5, mockito, assertj, mockmvc, spring boot test slices, parameterized tests, and testcontainers. use when the user asks for tests for spring services, controllers, repositories, validators, configuration, exception handlers, rest clients, security behavior, or when deciding between plain unit tests, slice tests, and full @springboottest.
---

# JUnit 5 + Spring Boot Testing

## Core Goal

Help produce fast, focused, maintainable tests for Spring Boot applications. Prefer the smallest test scope that proves the behavior: plain JUnit + Mockito first, Spring test slices next, and full `@SpringBootTest` only when a full application context is necessary.

## Default Decision Tree

1. **Pure business logic, service orchestration, validators, mappers, utility classes**  
   Use plain JUnit 5 with Mockito. Do not start a Spring context.

2. **MVC controller endpoint behavior**  
   Use `@WebMvcTest` with `MockMvc`. Mock service dependencies with Spring-managed mocks.

3. **JPA repository behavior**  
   Use `@DataJpaTest`. Prefer Testcontainers or a production-like database when SQL dialect, constraints, migrations, or JSON/date behavior matter.

4. **JSON serialization/deserialization**  
   Use `@JsonTest` and `JacksonTester`/`ObjectMapper` focused tests.

5. **REST clients or HTTP integrations**  
   Use `@RestClientTest`, mock servers, or client-specific testing tools. Avoid real network calls.

6. **Security rules**  
   Use focused MVC/security tests where possible, with `spring-security-test` helpers such as `@WithMockUser`.

7. **Application wiring, configuration, transactions across layers, startup behavior**  
   Use `@SpringBootTest`, optionally with `@AutoConfigureMockMvc`, only when the full Spring context is part of the behavior under test.

## Test Style Rules

- Use standard Maven/Gradle structure: production code in `src/main/java`, test code in `src/test/java`, test resources in `src/test/resources`.
- Name test classes with a `Test` suffix, such as `OrderServiceTest` or `OrderControllerTest`.
- Use Arrange-Act-Assert. Keep each test focused on one behavior.
- Prefer descriptive method names: `methodName_should_expectedBehavior_when_scenario`.
- Use `@DisplayName` for readable test reports when it improves clarity.
- Keep tests independent and idempotent. Avoid relying on execution order.
- Use `@BeforeEach` for repeated per-test setup. Use `@BeforeAll` only for expensive shared setup that is safe and static by default.
- Use `@Nested` to group related scenarios.
- Use `@Tag` for categories such as `fast`, `slice`, `integration`, or `container`.
- Avoid `@Disabled` without a clear reason and a follow-up path.

## Dependencies To Recommend

For JUnit 5 and Spring Boot projects, prefer `spring-boot-starter-test` because it already includes JUnit Jupiter, AssertJ, Mockito, Hamcrest, JSONassert, JsonPath, and Spring Test in typical Spring Boot setups.

Add focused dependencies only when needed:

- `org.junit.jupiter:junit-jupiter-params` for parameterized tests when not already available.
- `org.mockito:mockito-junit-jupiter` for plain Mockito tests outside Spring Boot starter coverage.
- `org.springframework.security:spring-security-test` for Spring Security tests.
- `org.testcontainers:junit-jupiter` plus the relevant database/module for container-backed tests.

Use build commands such as `mvn test` or `gradle test`. If a project uses wrappers, prefer `./mvnw test` or `./gradlew test`.

## Assertions

- Prefer AssertJ for fluent, readable assertions when available: `assertThat(actual).isEqualTo(expected)`.
- Use JUnit assertions from `org.junit.jupiter.api.Assertions` when that is the project convention.
- Use `assertThrows` for exceptions and assert important exception details.
- Use `assertAll` when multiple related assertions describe the same outcome.
- Include assertion messages only when they add diagnostic value beyond the assertion itself.

## Parameterized Tests

Use parameterized tests to remove duplication when the same behavior should hold for many inputs.

- Use `@ValueSource` for simple literals.
- Use `@CsvSource` for compact input/output tables.
- Use `@MethodSource` for complex objects or named scenarios.
- Use `@EnumSource` for enum coverage.
- Use `@CsvFileSource` when test cases are numerous and stable enough to live in `src/test/resources`.

Keep parameterized test cases readable. If the CSV row needs comments to be understood, prefer `@MethodSource` with named `Arguments` or a small scenario object.

## Mockito and Spring Mocking

- For plain unit tests, use `@ExtendWith(MockitoExtension.class)`, `@Mock`, and `@InjectMocks`.
- For Spring slice or context tests, replace Spring beans with Spring-managed mocks. Use the annotation supported by the project's Spring Boot version, such as `@MockitoBean` in newer Spring Boot versions or `@MockBean` in older projects.
- Mock only dependencies outside the unit under test. Do not mock value objects, DTOs, or the class being tested.
- Prefer verifying outcomes over verifying every interaction.
- Verify interactions only when the interaction itself is the behavior, such as publishing an event, sending a command, or calling an external gateway.
- Avoid overusing `lenient()`; it usually signals unnecessary stubbing.

## Service Unit Tests

For service-layer tests, default to plain JUnit + Mockito:

- Instantiate the service through `@InjectMocks` or an explicit constructor call.
- Mock repositories, clients, gateways, clocks, event publishers, and other dependencies.
- Use fixed `Clock` instances or injected time providers for time-dependent logic.
- Cover success, empty/not-found, validation failure, dependency failure, and edge cases.
- Do not use `@SpringBootTest` just to test a service method.

## Controller Tests With MockMvc

For MVC controllers, default to `@WebMvcTest(ControllerClass.class)`:

- Use `MockMvc` to perform requests.
- Mock service dependencies.
- Assert status, content type, headers, response JSON, and error bodies.
- Test validation failures with invalid request payloads.
- Test exception mapping through included `@ControllerAdvice` where applicable.
- Use `ObjectMapper` for request JSON instead of hand-written strings when practical.

## Repository Tests

For JPA repositories, default to `@DataJpaTest`:

- Assert query behavior, persistence mappings, constraints, sorting, pagination, and projections.
- Keep fixtures small and directly relevant.
- Use `TestEntityManager` or repositories to arrange persisted data.
- Remember that `@DataJpaTest` is transactional and usually rolls back after each test.
- Prefer Testcontainers when H2 would hide production database behavior.

## Full Context Tests

Use `@SpringBootTest` sparingly. It is appropriate for:

- Verifying application context startup.
- Cross-layer behavior that requires real Spring wiring.
- Configuration properties and conditional bean wiring.
- Transactional flows involving multiple Spring-managed components.
- End-to-end HTTP behavior with random ports where the HTTP server matters.

Keep full-context tests fewer, slower, and clearly tagged as integration tests.

## Test Configuration

- Put test-specific configuration in `src/test/resources/application-test.yml` or `application-test.properties`.
- Use `@ActiveProfiles("test")` when test-specific configuration is required.
- Never rely on real production credentials or external services in automated tests.
- Prefer stable deterministic fixtures over shared mutable state.
- Avoid `Thread.sleep`; use controllable clocks, Awaitility, or deterministic synchronization.


## Required Run-and-Fix Workflow

When generating or modifying tests for a user's project, do not stop after writing test code. Make a best effort to run the relevant tests and fix syntax, compile, import, dependency, and obvious runtime issues before giving the final answer.

1. **Identify the build tool and test command**
   - Prefer project wrappers when present: `./mvnw test`, `./gradlew test`, or the narrowest supported test task.
   - For Maven, run a focused command when possible, such as `./mvnw -Dtest=OrderServiceTest test`.
   - For Gradle, run a focused command when possible, such as `./gradlew test --tests "*.OrderServiceTest"`.
   - If wrappers are absent, use `mvn test` or `gradle test` only when the project clearly supports them.

2. **Run generated tests before finalizing**
   - After creating or editing test files, execute the smallest relevant test command available.
   - If multiple test classes were generated, run those specific classes first, then run the broader module test command when practical.
   - Capture the first actionable failure rather than overwhelming the user with full logs.

3. **Fix issues iteratively**
   - Fix Java syntax errors, missing imports, incorrect package names, incorrect annotations, wrong Mockito/Spring Boot annotations, assertion type mismatches, checked exceptions, and obvious fixture/setup mistakes.
   - Re-run the focused test command after each patch until tests pass or until blocked by missing project context, external services, unavailable dependencies, or unrelated pre-existing failures.
   - Prefer adapting tests to the existing project style and versions instead of forcing new libraries or annotations.

4. **Handle dependency and version mismatches**
   - Inspect `pom.xml`, `build.gradle`, or `build.gradle.kts` before choosing APIs that vary by version.
   - Use `@MockitoBean` only when the project's Spring Boot version supports it; otherwise use `@MockBean`.
   - Use JUnit Jupiter, Mockito, AssertJ, Spring Test, and Testcontainers APIs that are already available where possible.
   - If a needed dependency is missing, either add the minimal build-file change or clearly state the dependency that the user must approve/add.

5. **Report final test status**
   - State the exact command that was run.
   - State whether it passed.
   - If it did not pass, distinguish generated-test issues from unrelated existing project failures and summarize the remaining blocker.

If the execution environment cannot run the project, still perform static checks: verify imports, annotations, package names, constructor signatures, method names, and likely compilation issues against the available source files. Tell the user exactly what could not be run and why.

## Output Expectations

When writing or reviewing tests, provide:

1. The recommended test scope and why it is the smallest useful scope.
2. The test class code or patch.
3. Any required dependencies or imports.
4. The exact test command that was run, or the reason tests could not be run in the available environment.
5. The final result: passing, fixed after failures, blocked by missing context/dependencies, or failing because of unrelated existing project issues.
6. Notes about tradeoffs, such as when a slice test should become a full context test.
7. JUnit5 Test Coverage Report in markdown format to indicate what was covered by the tests and what was not, Coverage Improvement.

## Examples Reference

For ready-to-adapt examples of service, controller, repository, parameterized, and Testcontainers tests, consult `references/test-patterns.md` when the user asks for concrete code templates or a fuller example.
