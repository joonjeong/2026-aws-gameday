# Stage 1: compile
FROM amazoncorretto:21 AS builder
WORKDIR /app
COPY UnicornRentalApp.java .
RUN javac --add-modules jdk.httpserver -d /app UnicornRentalApp.java

# Stage 2: runtime
FROM amazoncorretto:21-al2023
RUN yum install -y awscli && yum clean all
WORKDIR /app
COPY --from=builder /app/*.class .

ENV PORT=8080
ENV AWS_REGION=ap-northeast-2
ENV AWS_DEFAULT_REGION=ap-northeast-2
ENV TABLE_NAME=unicorn-rental-orders

EXPOSE 8080

ENTRYPOINT ["java", "--add-modules", "jdk.httpserver", "-cp", "/app", "UnicornRentalApp"]
