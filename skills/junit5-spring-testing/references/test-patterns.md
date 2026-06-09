# JUnit 5 + Spring Boot Test Patterns

## Plain Service Unit Test

```java
@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private PaymentGateway paymentGateway;

    @InjectMocks
    private OrderService orderService;

    @Test
    void placeOrder_should_saveOrder_when_paymentSucceeds() {
        // Arrange
        var request = new PlaceOrderRequest("sku-123", 2);
        when(paymentGateway.authorize(any())).thenReturn(Authorization.approved("auth-1"));
        when(orderRepository.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0));

        // Act
        Order result = orderService.placeOrder(request);

        // Assert
        assertThat(result.getStatus()).isEqualTo(OrderStatus.PLACED);
        verify(orderRepository).save(any(Order.class));
    }

    @Test
    void placeOrder_should_throw_when_paymentDeclines() {
        // Arrange
        var request = new PlaceOrderRequest("sku-123", 2);
        when(paymentGateway.authorize(any())).thenReturn(Authorization.declined("insufficient funds"));

        // Act + Assert
        var ex = assertThrows(PaymentDeclinedException.class, () -> orderService.placeOrder(request));
        assertThat(ex).hasMessageContaining("insufficient funds");
        verify(orderRepository, never()).save(any());
    }
}
```

## Parameterized Test With CsvSource

```java
@ParameterizedTest(name = "{0} items at {1} each should total {2}")
@CsvSource({
    "1, 10.00, 10.00",
    "2, 10.00, 20.00",
    "3,  7.50, 22.50"
})
void calculateTotal_should_returnExpectedAmount(int quantity, BigDecimal unitPrice, BigDecimal expected) {
    var lineItem = new LineItem("sku-123", quantity, unitPrice);

    BigDecimal actual = lineItem.calculateTotal();

    assertThat(actual).isEqualByComparingTo(expected);
}
```

## WebMvcTest Controller Test

```java
@WebMvcTest(OrderController.class)
class OrderControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean // use @MockBean in older Spring Boot projects
    private OrderService orderService;

    @Test
    void createOrder_should_returnCreatedOrder_when_requestIsValid() throws Exception {
        var request = new CreateOrderRequest("sku-123", 2);
        var response = new OrderResponse(42L, "PLACED");
        when(orderService.createOrder(any(CreateOrderRequest.class))).thenReturn(response);

        mockMvc.perform(post("/orders")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isCreated())
            .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.id").value(42))
            .andExpect(jsonPath("$.status").value("PLACED"));
    }

    @Test
    void createOrder_should_returnBadRequest_when_requestIsInvalid() throws Exception {
        var invalidJson = "{\"sku\":\"\",\"quantity\":0}";

        mockMvc.perform(post("/orders")
                .contentType(MediaType.APPLICATION_JSON)
                .content(invalidJson))
            .andExpect(status().isBadRequest());
    }
}
```

## DataJpaTest Repository Test

```java
@DataJpaTest
class OrderRepositoryTest {

    @Autowired
    private OrderRepository orderRepository;

    @Test
    void findByCustomerId_should_returnOrdersForCustomer() {
        orderRepository.save(new Order("customer-1", OrderStatus.PLACED));
        orderRepository.save(new Order("customer-2", OrderStatus.CANCELLED));

        List<Order> result = orderRepository.findByCustomerId("customer-1");

        assertThat(result)
            .hasSize(1)
            .extracting(Order::getCustomerId)
            .containsExactly("customer-1");
    }
}
```

## DataJpaTest With Testcontainers

```java
@Testcontainers
@DataJpaTest
class OrderRepositoryPostgresTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired
    private OrderRepository orderRepository;

    @Test
    void save_should_persistJsonColumn_when_usingPostgresDialect() {
        // Arrange, act, and assert repository behavior that depends on Postgres.
    }
}
```

## SpringBootTest Smoke Test

```java
@SpringBootTest
@Tag("integration")
class ApplicationContextTest {

    @Test
    void contextLoads() {
        // Verifies that the Spring application context starts successfully.
    }
}
```

## Run-and-Fix Examples

### Maven Focused Test Command

```bash
./mvnw -Dtest=OrderServiceTest test
```

Use this after generating a single Maven test class. If the wrapper is absent and the project clearly uses Maven, use `mvn -Dtest=OrderServiceTest test`.

### Gradle Focused Test Command

```bash
./gradlew test --tests "*.OrderServiceTest"
```

Use this after generating a single Gradle test class. If the project is multi-module, run the matching module task, such as `./gradlew :orders:test --tests "*.OrderServiceTest"`.

### Failure Triage Checklist

When a generated test fails to compile or run, check in this order:

1. Package declaration matches the target test directory.
2. Class and method names match the production code exactly.
3. JUnit 5 imports are used instead of JUnit 4 imports.
4. AssertJ, Mockito, MockMvc, and Spring annotations are imported from the correct packages.
5. `@MockitoBean` versus `@MockBean` matches the Spring Boot version.
6. Mockito stubs use the correct argument types and return types.
7. Request/response DTO constructors or builders match the project code.
8. Tests do not call real external services.
9. Test resources and profiles required by the project are present.
10. Remaining failures are not caused by unrelated existing tests.

### Final Status Format

When returning generated tests, include a compact status note:

```text
Test command run: ./mvnw -Dtest=OrderServiceTest test
Result: passed
Fixes made after first run: added missing static Mockito import and corrected DTO constructor usage
```

If blocked:

```text
Test command run: not run
Result: blocked
Reason: no Maven/Gradle build file was available in the provided files
Static checks completed: imports, package declaration, and method signatures reviewed against available source
```
