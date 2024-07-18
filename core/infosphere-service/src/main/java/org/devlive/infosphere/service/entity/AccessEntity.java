package org.devlive.infosphere.service.entity;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonIncludeProperties;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import javax.persistence.Column;
import javax.persistence.Entity;
import javax.persistence.EntityListeners;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;
import javax.persistence.JoinColumn;
import javax.persistence.JoinTable;
import javax.persistence.ManyToOne;
import javax.persistence.Table;

import java.time.Instant;

@Data
@ToString
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "infosphere_access")
@EntityListeners(value = AuditingEntityListener.class)
public class AccessEntity
{
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "ip_address")
    private String address;

    @Column(name = "user_agent")
    private String agent;

    @Column(name = "client")
    private String client;

    @Column(name = "type")
    private String type;

    @Column(name = "duration")
    private Long duration;

    @Column(name = "location")
    private String location;

    @Column(name = "device")
    private String device;

    @Column(name = "create_time")
    @CreatedDate
    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")
    private Instant createTime;

    @ManyToOne
    @JoinTable(name = "infosphere_access_book_relation",
            joinColumns = @JoinColumn(name = "access_id"),
            inverseJoinColumns = @JoinColumn(name = "book_id"))
    @JsonIncludeProperties(value = {"name", "identify"})
    private BookEntity book;

    @ManyToOne
    @JoinTable(name = "infosphere_access_user_relation",
            joinColumns = @JoinColumn(name = "access_id"),
            inverseJoinColumns = @JoinColumn(name = "user_id"))
    @JsonIncludeProperties(value = {"id", "aliasName", "avatar", "email", "username"})
    private UserEntity user;
}
