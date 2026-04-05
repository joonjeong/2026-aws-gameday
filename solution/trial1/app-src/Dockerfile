FROM amazoncorretto:21-al2023

# AWS CLI v2
RUN dnf install -y awscli && dnf clean all

WORKDIR /opt/unicorn-rental/app

COPY UnicornRentalApp.java .

# Compile
RUN javac --add-modules jdk.httpserver -d . UnicornRentalApp.java

ENV PORT=8080
ENV AWS_REGION=ap-northeast-2
ENV AWS_DEFAULT_REGION=ap-northeast-2
ENV TABLE_NAME=unicorn-rental-orders

EXPOSE 8080

CMD ["java", "--add-modules", "jdk.httpserver", "-cp", "/opt/unicorn-rental/app", "UnicornRentalApp"]
